"""Background runner for novel AI analysis jobs."""
import json
import threading
from datetime import datetime, timezone
from typing import Any

from config import Config
from database import db_session
from models import AiProviderConfig, Chapter, ChapterAnalysis, Novel, NovelAnalysisChunk, NovelAnalysisJob, NovelAnalysisOverview
from services.ai_analysis import (
    AnalysisConfigError,
    AnalysisExecutionError,
    ChunkingError,
    build_analysis_chunks,
    build_runtime_config,
    clear_analysis_data,
    is_chapter_analysis_complete,
    is_overview_complete,
    mark_chunk_failed,
    mark_chunk_running,
    run_chunk_analysis,
    run_overview_analysis,
    save_chunk_analysis,
    save_overview_analysis,
    serialize_chunk_record,
    serialize_overview,
)

RUNNING_STATUSES = {"running", "pausing"}
RESUMABLE_STATUSES = {"paused", "failed"}
_ACTIVE_RUNNERS: dict[int, threading.Thread] = {}
_ACTIVE_RUNNERS_LOCK = threading.Lock()


class AnalysisJobStateError(RuntimeError):
    """Raised when an analysis action is not allowed in the current state."""



def recover_interrupted_jobs() -> None:
    session = db_session()
    try:
        jobs = session.query(NovelAnalysisJob).filter(
            NovelAnalysisJob.user_id == Config.DEFAULT_USER_ID,
            NovelAnalysisJob.status.in_(tuple(RUNNING_STATUSES)),
        ).all()
        if not jobs:
            return

        for job in jobs:
            job.status = "paused"
            job.pause_requested = False
            if not job.last_error:
                job.last_error = "应用重启后，分析任务已暂停，请手动继续。"

        session.query(NovelAnalysisChunk).filter(
            NovelAnalysisChunk.user_id == Config.DEFAULT_USER_ID,
            NovelAnalysisChunk.status == "running",
        ).update(
            {
                NovelAnalysisChunk.status: "pending",
                NovelAnalysisChunk.error_message: "",
            },
            synchronize_session=False,
        )
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()



def get_analysis_status(novel_id: int) -> dict[str, Any]:
    session = db_session()
    try:
        return _build_analysis_status_payload(session, novel_id)
    finally:
        session.close()



def start_analysis(novel_id: int) -> dict[str, Any]:
    session = db_session()
    try:
        _ensure_novel(session, novel_id)
        config = session.query(AiProviderConfig).filter_by(user_id=Config.DEFAULT_USER_ID).first()
        runtime_config = build_runtime_config(config)
        chapters = _load_ordered_chapters(session, novel_id)
        chunks = build_analysis_chunks(chapters, runtime_config.context_size)

        job = session.query(NovelAnalysisJob).filter_by(
            user_id=Config.DEFAULT_USER_ID,
            novel_id=novel_id,
        ).first()
        if job and job.status in RUNNING_STATUSES:
            raise AnalysisJobStateError("当前小说正在分析中，请稍后再试。")
        if job and job.total_chunks > 0 and job.status in {"paused", "failed", "completed"}:
            raise AnalysisJobStateError("当前小说已有分析任务，请使用“继续分析”或“重新开始分析”。")

        _reset_job_plan(session, novel_id, len(chapters), chunks)
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()

    _spawn_runner(novel_id)
    return get_analysis_status(novel_id)



def pause_analysis(novel_id: int) -> dict[str, Any]:
    session = db_session()
    try:
        job = _ensure_job(session, novel_id)
        if job.status not in RUNNING_STATUSES:
            raise AnalysisJobStateError("当前没有可暂停的分析任务。")

        updated_rows = session.query(NovelAnalysisJob).filter(
            NovelAnalysisJob.user_id == Config.DEFAULT_USER_ID,
            NovelAnalysisJob.novel_id == novel_id,
            NovelAnalysisJob.status.in_(tuple(RUNNING_STATUSES)),
        ).update(
            {
                NovelAnalysisJob.pause_requested: True,
                NovelAnalysisJob.status: "pausing",
            },
            synchronize_session=False,
        )
        session.commit()

        if updated_rows == 0:
            session.expire_all()
        return _build_analysis_status_payload(session, novel_id)
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()



def resume_analysis(novel_id: int) -> dict[str, Any]:
    session = db_session()
    try:
        _ensure_novel(session, novel_id)
        config = session.query(AiProviderConfig).filter_by(user_id=Config.DEFAULT_USER_ID).first()
        build_runtime_config(config)
        total_chapters = len(_load_ordered_chapters(session, novel_id))

        job = _ensure_job(session, novel_id)
        if job.status in RUNNING_STATUSES:
            raise AnalysisJobStateError("当前小说正在分析中，请勿重复启动。")
        if job.status not in RESUMABLE_STATUSES and not (job.status in {"idle", "completed"} and job.total_chunks > 0):
            raise AnalysisJobStateError("当前任务不可继续，请先开始分析。")

        chunks = session.query(NovelAnalysisChunk).filter_by(
            user_id=Config.DEFAULT_USER_ID,
            novel_id=novel_id,
        ).order_by(NovelAnalysisChunk.chunk_index.asc()).all()
        if not chunks:
            raise AnalysisJobStateError("未找到可继续的分析分块，请重新开始分析。")

        incomplete_chunk_indices = _find_incomplete_chunk_indices(session, novel_id, chunks)
        for chunk in chunks:
            if chunk.chunk_index in incomplete_chunk_indices or chunk.status in {"failed", "running"}:
                chunk.status = "pending"
                chunk.error_message = ""

        completed_chunks = sum(1 for chunk in chunks if chunk.status == "completed")
        overview = session.query(NovelAnalysisOverview).filter_by(
            user_id=Config.DEFAULT_USER_ID,
            novel_id=novel_id,
        ).first()
        overview_complete = is_overview_complete(overview, total_chapters)
        if completed_chunks >= len(chunks) and overview_complete:
            raise AnalysisJobStateError("分析已完成，请使用“重新开始分析”重新生成。")

        job.status = "running"
        job.pause_requested = False
        job.completed_at = None
        job.last_error = ""
        job.total_chunks = len(chunks)
        job.completed_chunks = completed_chunks
        job.total_chapters = total_chapters
        job.analyzed_chapters = _count_complete_chapter_analyses(session, novel_id)
        next_pending = next((chunk for chunk in chunks if chunk.status != "completed"), None)
        if next_pending:
            job.current_chunk_index = next_pending.chunk_index
        elif chunks:
            job.current_chunk_index = chunks[-1].chunk_index

        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()

    _spawn_runner(novel_id)
    return get_analysis_status(novel_id)



def restart_analysis(novel_id: int) -> dict[str, Any]:
    session = db_session()
    try:
        _ensure_novel(session, novel_id)
        config = session.query(AiProviderConfig).filter_by(user_id=Config.DEFAULT_USER_ID).first()
        runtime_config = build_runtime_config(config)
        chapters = _load_ordered_chapters(session, novel_id)
        chunks = build_analysis_chunks(chapters, runtime_config.context_size)

        job = session.query(NovelAnalysisJob).filter_by(
            user_id=Config.DEFAULT_USER_ID,
            novel_id=novel_id,
        ).first()
        if job and job.status in RUNNING_STATUSES:
            raise AnalysisJobStateError("请先暂停当前分析任务，再重新开始。")

        _reset_job_plan(session, novel_id, len(chapters), chunks)
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()

    _spawn_runner(novel_id)
    return get_analysis_status(novel_id)



def _spawn_runner(novel_id: int) -> None:
    with _ACTIVE_RUNNERS_LOCK:
        active_thread = _ACTIVE_RUNNERS.get(novel_id)
        if active_thread and active_thread.is_alive():
            return

        thread = threading.Thread(
            target=_run_analysis_job,
            args=(novel_id,),
            name=f"analysis-runner-{novel_id}",
            daemon=True,
        )
        _ACTIVE_RUNNERS[novel_id] = thread
        thread.start()



def _run_analysis_job(novel_id: int) -> None:
    session = db_session()
    try:
        novel = session.query(Novel).filter_by(id=novel_id, user_id=Config.DEFAULT_USER_ID).first()
        if not novel:
            return

        config = session.query(AiProviderConfig).filter_by(user_id=Config.DEFAULT_USER_ID).first()
        runtime_config = build_runtime_config(config)
        chapters = _load_ordered_chapters(session, novel_id)
        chapter_map = {chapter.chapter_index: chapter for chapter in chapters}
        chunk_rows = session.query(NovelAnalysisChunk).filter_by(
            user_id=Config.DEFAULT_USER_ID,
            novel_id=novel_id,
        ).order_by(NovelAnalysisChunk.chunk_index.asc()).all()
        if not chunk_rows:
            _fail_job(session, novel_id, "分析分块不存在，请重新开始分析。")
            return

        total_chapters = len(chapters)
        total_chunks = len(chunk_rows)
        incomplete_chunk_indices = _find_incomplete_chunk_indices(session, novel_id, chunk_rows)
        if incomplete_chunk_indices:
            for chunk_row in chunk_rows:
                if chunk_row.chunk_index in incomplete_chunk_indices and chunk_row.status == "completed":
                    chunk_row.status = "pending"
                    chunk_row.error_message = ""
            session.commit()

        for chunk_row in chunk_rows:
            session.expire_all()
            job = session.query(NovelAnalysisJob).filter_by(
                user_id=Config.DEFAULT_USER_ID,
                novel_id=novel_id,
            ).first()
            if not job:
                return

            if job.pause_requested:
                _pause_job(session, job)
                return

            chunk_row = session.query(NovelAnalysisChunk).filter_by(
                user_id=Config.DEFAULT_USER_ID,
                novel_id=novel_id,
                chunk_index=chunk_row.chunk_index,
            ).first()
            if not chunk_row or chunk_row.status == "completed":
                continue

            chunk_payload = _hydrate_chunk_payload(chunk_row, chapter_map)
            mark_chunk_running(session, novel_id, chunk_payload)
            job.status = "running"
            job.current_chunk_index = chunk_row.chunk_index
            job.last_error = ""
            job.last_heartbeat = _now()
            session.commit()

            try:
                result = run_chunk_analysis(runtime_config, novel, chunk_payload, total_chunks)
            except Exception as exc:
                session.rollback()
                error_message = f"第 {chunk_row.chunk_index + 1} 块分析失败：{_format_exception_message(exc)}"
                job = session.query(NovelAnalysisJob).filter_by(
                    user_id=Config.DEFAULT_USER_ID,
                    novel_id=novel_id,
                ).first()
                if not job:
                    return
                mark_chunk_failed(session, novel_id, chunk_payload, error_message)
                _update_job_counters(session, job, total_chapters)
                job.status = "failed"
                job.pause_requested = False
                job.last_error = error_message
                job.last_heartbeat = _now()
                session.commit()
                return

            job = session.query(NovelAnalysisJob).filter_by(
                user_id=Config.DEFAULT_USER_ID,
                novel_id=novel_id,
            ).first()
            if not job:
                return

            save_chunk_analysis(session, novel_id, chunk_payload, result)
            _update_job_counters(session, job, total_chapters)
            job.status = "running"
            job.last_error = ""
            job.last_heartbeat = _now()

            if job.pause_requested:
                _pause_job(session, job)
                return

            session.commit()

        job = session.query(NovelAnalysisJob).filter_by(
            user_id=Config.DEFAULT_USER_ID,
            novel_id=novel_id,
        ).first()
        if not job:
            return

        _update_job_counters(session, job, total_chapters)
        overview = session.query(NovelAnalysisOverview).filter_by(
            user_id=Config.DEFAULT_USER_ID,
            novel_id=novel_id,
        ).first()
        overview_complete = is_overview_complete(overview, total_chapters)

        if job.pause_requested:
            _pause_job(session, job)
            return

        if job.completed_chunks >= job.total_chunks > 0 and not overview_complete:
            chapter_rows = session.query(ChapterAnalysis).filter_by(
                user_id=Config.DEFAULT_USER_ID,
                novel_id=novel_id,
            ).order_by(ChapterAnalysis.chapter_index.asc()).all()
            if len(chapter_rows) < total_chapters or any(not is_chapter_analysis_complete(row) for row in chapter_rows):
                raise AnalysisExecutionError("章节分析数据尚未全部补全，无法生成全书概览。")

            job.status = "running"
            job.current_chunk_index = job.total_chunks
            job.last_error = ""
            job.last_heartbeat = _now()
            session.commit()

            try:
                overview_result = run_overview_analysis(runtime_config, novel, chapter_rows, total_chapters)
            except Exception as exc:
                session.rollback()
                error_message = f"全书概览生成失败：{_format_exception_message(exc)}"
                job = session.query(NovelAnalysisJob).filter_by(
                    user_id=Config.DEFAULT_USER_ID,
                    novel_id=novel_id,
                ).first()
                if not job:
                    return
                _update_job_counters(session, job, total_chapters)
                job.status = "failed"
                job.pause_requested = False
                job.last_error = error_message
                job.last_heartbeat = _now()
                session.commit()
                return

            job = session.query(NovelAnalysisJob).filter_by(
                user_id=Config.DEFAULT_USER_ID,
                novel_id=novel_id,
            ).first()
            if not job:
                return

            save_overview_analysis(session, novel_id, overview_result)
            _update_job_counters(session, job, total_chapters)
            job.status = "completed"
            job.pause_requested = False
            job.completed_at = _now()
            job.last_error = ""
            job.last_heartbeat = _now()
            session.commit()
            return

        if job.completed_chunks >= job.total_chunks > 0 and overview_complete:
            job.status = "completed"
            job.pause_requested = False
            job.completed_at = job.completed_at or _now()
        else:
            job.status = "running"
        session.commit()
    except Exception as exc:
        session.rollback()
        try:
            _fail_job(session, novel_id, _format_exception_message(exc))
        except Exception:
            session.rollback()
    finally:
        session.close()
        db_session.remove()
        with _ACTIVE_RUNNERS_LOCK:
            active_thread = _ACTIVE_RUNNERS.get(novel_id)
            if active_thread is threading.current_thread():
                _ACTIVE_RUNNERS.pop(novel_id, None)



def _reset_job_plan(session, novel_id: int, total_chapters: int, chunks: list[dict[str, Any]]) -> None:
    if not chunks:
        raise AnalysisJobStateError("当前小说没有可分析的章节。")

    clear_analysis_data(session, novel_id)

    job = session.query(NovelAnalysisJob).filter_by(
        user_id=Config.DEFAULT_USER_ID,
        novel_id=novel_id,
    ).first()
    if not job:
        job = NovelAnalysisJob(
            user_id=Config.DEFAULT_USER_ID,
            novel_id=novel_id,
        )
        session.add(job)

    job.status = "running"
    job.total_chapters = total_chapters
    job.analyzed_chapters = 0
    job.total_chunks = len(chunks)
    job.completed_chunks = 0
    job.current_chunk_index = chunks[0]["chunkIndex"]
    job.pause_requested = False
    job.last_error = ""
    job.started_at = _now()
    job.completed_at = None
    job.last_heartbeat = None

    for chunk in chunks:
        session.add(NovelAnalysisChunk(
            user_id=Config.DEFAULT_USER_ID,
            novel_id=novel_id,
            chunk_index=chunk["chunkIndex"],
            start_chapter_index=chunk["startChapterIndex"],
            end_chapter_index=chunk["endChapterIndex"],
            chapter_indices_json=json.dumps(chunk["chapterIndices"], ensure_ascii=False),
            status="pending",
        ))



def _pause_job(session, job: NovelAnalysisJob) -> None:
    job.status = "paused"
    job.pause_requested = False
    job.last_heartbeat = _now()
    session.commit()



def _fail_job(session, novel_id: int, message: str) -> None:
    job = session.query(NovelAnalysisJob).filter_by(
        user_id=Config.DEFAULT_USER_ID,
        novel_id=novel_id,
    ).first()
    if not job:
        return
    _update_job_counters(session, job, job.total_chapters)
    job.status = "failed"
    job.pause_requested = False
    job.last_error = message
    job.last_heartbeat = _now()
    session.commit()



def _build_analysis_status_payload(session, novel_id: int) -> dict[str, Any]:
    chapter_count = session.query(Chapter).filter_by(novel_id=novel_id).count()
    job = session.query(NovelAnalysisJob).filter_by(
        user_id=Config.DEFAULT_USER_ID,
        novel_id=novel_id,
    ).first()
    overview = session.query(NovelAnalysisOverview).filter_by(
        user_id=Config.DEFAULT_USER_ID,
        novel_id=novel_id,
    ).first()
    chunk_rows = session.query(NovelAnalysisChunk).filter_by(
        user_id=Config.DEFAULT_USER_ID,
        novel_id=novel_id,
    ).order_by(NovelAnalysisChunk.chunk_index.asc()).all()
    serialized_chunks = [serialize_chunk_record(chunk) for chunk in chunk_rows]
    incomplete_chunk_indices = _find_incomplete_chunk_indices(session, novel_id, chunk_rows)
    completed_chunks = sum(
        1 for chunk in chunk_rows if chunk.status == "completed" and chunk.chunk_index not in incomplete_chunk_indices
    )
    total_chunks = len(serialized_chunks)
    expected_total_chapters = job.total_chapters if job and job.total_chapters > 0 else chapter_count
    analyzed_chapters = _count_complete_chapter_analyses(session, novel_id)
    overview_complete = is_overview_complete(overview, expected_total_chapters)
    analysis_complete = total_chunks > 0 and not incomplete_chunk_indices and overview_complete and completed_chunks >= total_chunks

    current_stage = _determine_current_stage(
        job.status if job else "idle",
        total_chunks,
        completed_chunks,
        overview_complete,
        analysis_complete,
    )

    current_chunk = None
    if job and total_chunks > 0 and current_stage == "chapters":
        current_chunk = next((chunk for chunk in serialized_chunks if chunk["chunkIndex"] == job.current_chunk_index), None)
        if not current_chunk or current_chunk["chunkIndex"] in incomplete_chunk_indices and current_chunk["status"] == "completed":
            current_chunk = next(
                (
                    chunk
                    for chunk in serialized_chunks
                    if chunk["status"] in {"running", "pending", "failed"}
                    or chunk["chunkIndex"] in incomplete_chunk_indices
                ),
                None,
            )

    progress_steps = total_chunks + (1 if total_chunks > 0 else 0)
    completed_steps = completed_chunks + (1 if overview_complete and total_chunks > 0 else 0)
    progress_percent = round((completed_steps / progress_steps) * 100, 2) if progress_steps else 0.0
    status = job.status if job else "idle"
    can_resume = status in RESUMABLE_STATUSES or (status in {"idle", "completed"} and total_chunks > 0 and not analysis_complete)

    return {
        "job": {
            "status": status,
            "currentStage": current_stage,
            "analysisComplete": analysis_complete,
            "totalChapters": expected_total_chapters,
            "analyzedChapters": analyzed_chapters if job else 0,
            "totalChunks": job.total_chunks if job else total_chunks,
            "completedChunks": completed_chunks,
            "currentChunkIndex": job.current_chunk_index if job else 0,
            "progressPercent": progress_percent,
            "pauseRequested": bool(job.pause_requested) if job else False,
            "lastError": job.last_error if job else "",
            "startedAt": job.started_at.isoformat() if job and job.started_at else None,
            "completedAt": job.completed_at.isoformat() if job and job.completed_at else None,
            "lastHeartbeat": job.last_heartbeat.isoformat() if job and job.last_heartbeat else None,
            "updatedAt": job.updated_at.isoformat() if job and job.updated_at else None,
            "currentChunk": current_chunk,
            "canStart": status in {"idle"} or total_chunks == 0,
            "canPause": status in RUNNING_STATUSES,
            "canResume": can_resume,
            "canRestart": status not in RUNNING_STATUSES and total_chunks > 0,
        },
        "overview": serialize_overview(overview),
        "chunks": serialized_chunks,
    }



def _update_job_counters(session, job: NovelAnalysisJob, total_chapters: int) -> None:
    job.total_chapters = total_chapters
    chunk_rows = session.query(NovelAnalysisChunk).filter_by(
        user_id=Config.DEFAULT_USER_ID,
        novel_id=job.novel_id,
    ).order_by(NovelAnalysisChunk.chunk_index.asc()).all()
    job.total_chunks = len(chunk_rows)
    incomplete_chunk_indices = _find_incomplete_chunk_indices(session, job.novel_id, chunk_rows)
    job.completed_chunks = sum(
        1 for chunk in chunk_rows if chunk.status == "completed" and chunk.chunk_index not in incomplete_chunk_indices
    )
    job.analyzed_chapters = _count_complete_chapter_analyses(session, job.novel_id)



def _count_complete_chapter_analyses(session, novel_id: int) -> int:
    chapter_rows = session.query(ChapterAnalysis).filter_by(
        user_id=Config.DEFAULT_USER_ID,
        novel_id=novel_id,
    ).all()
    return sum(1 for row in chapter_rows if is_chapter_analysis_complete(row))



def _find_incomplete_chunk_indices(
    session,
    novel_id: int,
    chunk_rows: list[NovelAnalysisChunk],
) -> set[int]:
    if not chunk_rows:
        return set()

    chapter_rows = session.query(ChapterAnalysis).filter_by(
        user_id=Config.DEFAULT_USER_ID,
        novel_id=novel_id,
    ).all()
    chapter_map = {row.chapter_index: row for row in chapter_rows}
    incomplete_chunk_indices: set[int] = set()

    for chunk_row in chunk_rows:
        chapter_indices = _load_chapter_indices(chunk_row.chapter_indices_json)
        if chunk_row.status != "completed" or not chapter_indices:
            incomplete_chunk_indices.add(chunk_row.chunk_index)
            continue
        if any(not is_chapter_analysis_complete(chapter_map.get(chapter_index)) for chapter_index in chapter_indices):
            incomplete_chunk_indices.add(chunk_row.chunk_index)

    return incomplete_chunk_indices



def _determine_current_stage(
    status: str,
    total_chunks: int,
    completed_chunks: int,
    overview_complete: bool,
    analysis_complete: bool,
) -> str:
    if analysis_complete:
        return "completed"
    if total_chunks <= 0 or status == "idle":
        return "idle"
    if completed_chunks >= total_chunks and not overview_complete:
        return "overview"
    return "chapters"



def _hydrate_chunk_payload(chunk_row: NovelAnalysisChunk, chapter_map: dict[int, Chapter]) -> dict[str, Any]:
    chapter_indices = _load_chapter_indices(chunk_row.chapter_indices_json)
    chapters = []
    total_length = 0
    for chapter_index in chapter_indices:
        chapter = chapter_map.get(chapter_index)
        if not chapter:
            raise AnalysisJobStateError(f"找不到第 {chapter_index + 1} 章，无法继续分析。")
        chapter_text = _render_chapter_for_prompt(chapter)
        chapter_length = len(chapter_text.encode("utf-8"))
        chapters.append({
            "chapterIndex": chapter.chapter_index,
            "title": chapter.title,
            "content": chapter.content,
            "text": chapter_text,
            "length": chapter_length,
        })
        total_length += chapter_length

    return {
        "chunkIndex": chunk_row.chunk_index,
        "chapterIndices": chapter_indices,
        "startChapterIndex": chunk_row.start_chapter_index,
        "endChapterIndex": chunk_row.end_chapter_index,
        "contentLength": total_length,
        "chapters": chapters,
        "text": "\n\n".join(chapter["text"] for chapter in chapters),
    }



def _load_chapter_indices(raw: str | None) -> list[int]:
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return []
    if not isinstance(parsed, list):
        return []
    results: list[int] = []
    for item in parsed:
        try:
            results.append(int(item))
        except (TypeError, ValueError):
            continue
    return results



def _render_chapter_for_prompt(chapter: Chapter) -> str:
    return f"[章节索引]{chapter.chapter_index}\n[章节标题]{chapter.title or '未命名章节'}\n[章节正文]\n{chapter.content or ''}"



def _ensure_novel(session, novel_id: int) -> Novel:
    novel = session.query(Novel).filter_by(id=novel_id, user_id=Config.DEFAULT_USER_ID).first()
    if not novel:
        raise AnalysisJobStateError("小说不存在。")
    return novel



def _ensure_job(session, novel_id: int) -> NovelAnalysisJob:
    job = session.query(NovelAnalysisJob).filter_by(
        user_id=Config.DEFAULT_USER_ID,
        novel_id=novel_id,
    ).first()
    if not job:
        raise AnalysisJobStateError("当前小说还没有分析任务。")
    return job



def _load_ordered_chapters(session, novel_id: int) -> list[Chapter]:
    chapters = session.query(Chapter).filter_by(novel_id=novel_id).order_by(Chapter.chapter_index.asc()).all()
    if not chapters:
        raise AnalysisJobStateError("当前小说没有可分析的章节。")
    return chapters



def _format_exception_message(exc: Exception) -> str:
    if isinstance(exc, (AnalysisConfigError, AnalysisExecutionError, ChunkingError, AnalysisJobStateError)):
        return str(exc)
    return f"系统内部错误：{exc}"



def _now() -> datetime:
    return datetime.now(timezone.utc)
