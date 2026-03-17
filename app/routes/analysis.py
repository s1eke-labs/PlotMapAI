"""AI analysis API routes."""
from flask import Blueprint, jsonify
from sqlalchemy.orm import Session

from config import Config
from database import db_session
from models import ChapterAnalysis, Novel, NovelAnalysisOverview
from services.ai_analysis import (
    AnalysisConfigError,
    ChunkingError,
    build_character_graph_payload,
    serialize_chapter_analysis,
    serialize_overview,
)
from services.analysis_runner import (
    AnalysisJobStateError,
    get_analysis_status,
    pause_analysis,
    refresh_overview,
    restart_analysis,
    resume_analysis,
    start_analysis,
)

analysis_bp = Blueprint("analysis", __name__)

NOVEL_NOT_FOUND_ERROR = "小说不存在。"


@analysis_bp.route("/novels/<int:novel_id>/analysis/status", methods=["GET"])
def get_novel_analysis_status(novel_id: int):
    session: Session = db_session()
    try:
        _ensure_novel_exists(session, novel_id)
        return jsonify(get_analysis_status(novel_id))
    except Exception as exc:
        return _handle_analysis_error(exc)
    finally:
        session.close()


@analysis_bp.route("/novels/<int:novel_id>/analysis/overview", methods=["GET"])
def get_novel_analysis_overview(novel_id: int):
    session: Session = db_session()
    try:
        _ensure_novel_exists(session, novel_id)
        overview = session.query(NovelAnalysisOverview).filter_by(
            user_id=Config.DEFAULT_USER_ID,
            novel_id=novel_id,
        ).first()
        return jsonify({"overview": serialize_overview(overview)})
    except Exception as exc:
        return _handle_analysis_error(exc)
    finally:
        session.close()


@analysis_bp.route("/novels/<int:novel_id>/analysis/chapters/<int:chapter_index>", methods=["GET"])
def get_chapter_analysis(novel_id: int, chapter_index: int):
    session: Session = db_session()
    try:
        _ensure_novel_exists(session, novel_id)
        chapter_analysis = session.query(ChapterAnalysis).filter_by(
            user_id=Config.DEFAULT_USER_ID,
            novel_id=novel_id,
            chapter_index=chapter_index,
        ).first()
        return jsonify({"analysis": serialize_chapter_analysis(chapter_analysis)})
    except Exception as exc:
        return _handle_analysis_error(exc)
    finally:
        session.close()


@analysis_bp.route("/novels/<int:novel_id>/analysis/character-graph", methods=["GET"])
def get_novel_character_graph(novel_id: int):
    session: Session = db_session()
    try:
        _ensure_novel_exists(session, novel_id)
        return jsonify(build_character_graph_payload(session, novel_id))
    except Exception as exc:
        return _handle_analysis_error(exc)
    finally:
        session.close()


@analysis_bp.route("/novels/<int:novel_id>/analysis/start", methods=["POST"])
def start_novel_analysis(novel_id: int):
    return _run_action(lambda: start_analysis(novel_id))


@analysis_bp.route("/novels/<int:novel_id>/analysis/pause", methods=["POST"])
def pause_novel_analysis(novel_id: int):
    return _run_action(lambda: pause_analysis(novel_id))


@analysis_bp.route("/novels/<int:novel_id>/analysis/resume", methods=["POST"])
def resume_novel_analysis(novel_id: int):
    return _run_action(lambda: resume_analysis(novel_id))


@analysis_bp.route("/novels/<int:novel_id>/analysis/restart", methods=["POST"])
def restart_novel_analysis(novel_id: int):
    return _run_action(lambda: restart_analysis(novel_id))


@analysis_bp.route("/novels/<int:novel_id>/analysis/refresh-overview", methods=["POST"])
def refresh_novel_analysis_overview(novel_id: int):
    return _run_action(lambda: refresh_overview(novel_id))



def _run_action(action):
    try:
        return jsonify(action())
    except Exception as exc:
        return _handle_analysis_error(exc)



def _handle_analysis_error(exc):
    if isinstance(exc, AnalysisJobStateError) and str(exc) == NOVEL_NOT_FOUND_ERROR:
        return jsonify({"error": str(exc)}), 404
    if isinstance(exc, (AnalysisConfigError, ChunkingError, AnalysisJobStateError)):
        return jsonify({"error": str(exc)}), 400
    return jsonify({"error": str(exc)}), 500



def _ensure_novel_exists(session: Session, novel_id: int) -> Novel:
    novel = session.query(Novel).filter_by(id=novel_id, user_id=Config.DEFAULT_USER_ID).first()
    if not novel:
        raise AnalysisJobStateError(NOVEL_NOT_FOUND_ERROR)
    return novel
