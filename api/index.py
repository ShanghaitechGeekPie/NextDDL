import flask
import requests
from utils import egateHandler, hydroHandler
from utils.gsUtils import *
import urllib3

app = flask.Flask(__name__)


def session_from_cookies(cookies: dict | None) -> requests.Session | None:
    if not cookies or not isinstance(cookies, dict):
        return None
    session = requests.Session()
    session.cookies = requests.utils.cookiejar_from_dict(cookies)
    return session


def cookies_from_session(session: requests.Session) -> dict:
    return requests.utils.dict_from_cookiejar(session.cookies)


def is_gradescope_session_valid(session: requests.Session) -> bool:
    try:
        response = session.get(BASE_URL, allow_redirects=True)
        if "login" in response.url:
            return False
        if "session[email]" in response.text and "Log In" in response.text:
            return False
        return True
    except Exception:
        return False


# Allow local CORS for debugging
@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST"
    return response


@app.route("/api/gradescope", methods=["POST"])
def gsHandler() -> flask.Response:
    # Get payload from request
    payload = flask.request.get_json()
    include_session = bool(payload.get("include_session"))

    # Login or session
    cookies = payload.get("session")
    if cookies:
        gs = Gradescope(auto_login=False)
        gs.session.cookies = requests.utils.cookiejar_from_dict(cookies)
        gs.logged_in = is_gradescope_session_valid(gs.session)
        if not gs.logged_in:
            return flask.jsonify({"status": "session_expired", "message": "Session expired"})
    else:
        gs = Gradescope(payload["email"], payload["password"])
        if not gs.logged_in:
            return flask.jsonify({"status": "error", "message": "Invalid email or password"})

    # Format response
    data = []

    for course in gs.get_courses(role=Role.STUDENT):
        # print(course)
        for assignment in gs.get_assignments(course):
            due = [None, None]
            if assignment["dueDate"]:
                due = assignment["dueDate"]
            data.append(
                {
                    "title": assignment["title"],
                    "course": course.full_name,
                    "url": assignment["url"],
                    "due": due[0],
                    "latedue": due[1] if len(due) > 1 else None,
                    "status": assignment["status"],
                    "submitted": assignment["status"] != "No Submission",
                    "raw": assignment,
                }
            )

    response = {"status": "success", "data": data}
    if include_session and not cookies:
        response["session"] = cookies_from_session(gs.session)
    return flask.jsonify(response)

@app.route("/api/exam", methods=["POST"])
def eamsExamHandler() -> flask.Response:
    # Get payload from request
    urllib3.disable_warnings()
    payload = flask.request.get_json()

    include_session = bool(payload.get("include_session"))
    # Login or session
    session = session_from_cookies(payload.get("session"))
    if session is None:
        session = egateHandler.login(payload["studentid"], payload["password"])
    # if (not bb.logged_in):
    #     return {
    #         'status': 'error',
    #         'message': 'Invalid username or password'
    #     }

    # Format response
    try:
        data = egateHandler.getBB(session)
    except Exception:
        if payload.get("session"):
            return flask.jsonify({"status": "session_expired", "message": "Session expired"})
        return flask.jsonify({"status": "error", "message": "Login failed"})

    # urllib3.warnings.simplefilter("always", urllib3.exceptions.InsecureRequestWarning)

    response = {"status": "success", "data": data}
    if include_session and not payload.get("session"):
        response["session"] = cookies_from_session(session)
    return flask.jsonify(response)

@app.route("/api/blackboard", methods=["POST"])
def bbHandler() -> flask.Response:
    # Get payload from request
    urllib3.disable_warnings()
    payload = flask.request.get_json()

    include_session = bool(payload.get("include_session"))
    # Login or session
    session = session_from_cookies(payload.get("session"))
    if session is None:
        session = egateHandler.login(payload["studentid"], payload["password"])
    # if (not bb.logged_in):
    #     return {
    #         'status': 'error',
    #         'message': 'Invalid username or password'
    #     }

    # Format response
    try:
        data = egateHandler.getBB(session)
    except Exception:
        if payload.get("session"):
            return flask.jsonify({"status": "session_expired", "message": "Session expired"})
        return flask.jsonify({"status": "error", "message": "Login failed"})

    # urllib3.warnings.simplefilter("always", urllib3.exceptions.InsecureRequestWarning)

    response = {"status": "success", "data": data}
    if include_session and not payload.get("session"):
        response["session"] = cookies_from_session(session)
    return flask.jsonify(response)


@app.route("/api/hydro", methods=["POST"])
def ojHandler() -> flask.Response:
    # Get payload from request
    payload = flask.request.get_json()
    include_session = bool(payload.get("include_session"))

    # Login or session
    session = session_from_cookies(payload.get("session"))
    if session is None:
        session = hydroHandler.login(payload["url"], payload["username"], payload["password"])

    # Format response
    try:
        data = hydroHandler.getHomework(payload["url"], session)
    except Exception:
        if payload.get("session"):
            return flask.jsonify({"status": "session_expired", "message": "Session expired"})
        return flask.jsonify({"status": "error", "message": "Login failed"})

    response = {"status": "success", "data": data}
    if include_session and not payload.get("session"):
        response["session"] = cookies_from_session(session)
    return flask.jsonify(response)


# Handle Not Found
@app.errorhandler(404)
def page_not_found(e):
    return flask.jsonify({"status": "error", "message": "Not Found: " + flask.request.url})


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
