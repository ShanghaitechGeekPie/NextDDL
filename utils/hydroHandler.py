from datetime import datetime
import requests
from urllib.parse import urlparse

REQUEST_TIMEOUT = (5, 20)


def _build_login_headers(base_url: str) -> dict[str, str]:
    parsed = urlparse(base_url)
    origin = f"{parsed.scheme}://{parsed.netloc}" if parsed.scheme and parsed.netloc else ""
    return {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Referer": f"{base_url}/login",
        "Origin": origin,
    }

def login(url:str, username:str, password:str) -> requests.Session:
    session = requests.Session()
    base_url = url.rstrip('/')

    session.get(
        f"{base_url}/login",
        headers={"User-Agent": "Mozilla/5.0"},
        timeout=REQUEST_TIMEOUT,
    )

    session.post(
        f"{base_url}/login",
        data={
            "uname": username,
            "password": password,
            "rememberme": "on",
            "tfa": "",
            "authnChallenge": "",
            "login_submit": "登录",
        },
        headers=_build_login_headers(base_url),
        timeout=REQUEST_TIMEOUT,
        allow_redirects=False,
    )
    return session

def getHomework(url:str, session: requests.Session):
    base_url = url.rstrip('/')
    parsed = urlparse(base_url)
    origin = f"{parsed.scheme}://{parsed.netloc}" if parsed.scheme and parsed.netloc else base_url
    payload = session.get(
        f"{base_url}/homework",
        headers={
            "Accept": "application/json",
        },
        timeout=REQUEST_TIMEOUT,
        allow_redirects=False,
    ).json()

    if isinstance(payload, dict) and isinstance(payload.get("url"), str) and "/login" in payload["url"]:
        raise ValueError("Hydro session is not authenticated")


    if isinstance(payload, dict) and isinstance(payload.get("calendar"), list):
        response = payload["calendar"]
    elif isinstance(payload, dict) and isinstance(payload.get("tdocs"), list):
        response = payload["tdocs"]
    else:
        raise ValueError("Unexpected Hydro homework payload")
    
    data = []
    
    for item in response:
        end_at = item.get("endAt") or item.get("dueAt")
        if not isinstance(end_at, str):
            continue

        due = datetime.strptime(end_at[:-6], "%Y-%m-%dT%H:%M:%S").timestamp()
        assign = item.get("assign") if isinstance(item.get("assign"), list) else []
        course = assign[0] if assign else item.get("domainName") or item.get("domainId") or "Hydro"
        title = item.get("title") or item.get("docTitle") or item.get("_id") or "Untitled"
        doc_id = item.get("docId") or item.get("_id") or ""
        item_url = item.get("url")
        if isinstance(item_url, str) and item_url:
            detail_url = item_url if item_url.startswith("http") else f"{origin}{item_url}"
        else:
            detail_url = f"{base_url}/homework{doc_id}"

        data.append(
            {
                "title": title,
                "type": item.get("rule") or "Homework",
                "due": due,
                "course": course,
                "submitted": due < datetime.now().timestamp(),  # TODO: check if submitted
                "url": detail_url,
                "status": "Live",
            }
        )
    
    return data