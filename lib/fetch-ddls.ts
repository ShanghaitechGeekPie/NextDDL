import "server-only";
import crypto from "crypto";

type CookieMap = Record<string, string>;

export type FetchDdlFields = Record<string, unknown> & {
  account?: string;
  username?: string;
  email?: string;
  studentid?: string;
  password?: string;
  url?: string;
  session?: CookieMap;
  baseUrl?: string;
};

export type DeadlineItem = {
  platform: string;
  title: string;
  course: string;
  due: number; // unix seconds
  status?: string | null;
  url?: string | null;
};

function cookieMapToHeader(cookies: CookieMap | string[] | undefined): string {
  if (!cookies) return "";
  if (Array.isArray(cookies)) return cookies.join("; ");
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

function cookieHeaderToMap(cookieHeader: string | null): CookieMap {
  const cookies: CookieMap = {};
  if (!cookieHeader) return cookies;

  for (const part of cookieHeader.split(/;\s*/)) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) cookies[key] = value;
  }

  return cookies;
}

function extractSetCookies(headers: Headers): CookieMap {
  const cookies: CookieMap = {};
  const setCookieHeaders = headers.getSetCookie?.() ?? [];
  for (const sc of setCookieHeaders) {
    const match = sc.match(/^([^=]+)=([^;]*)/);
    if (match) {
      cookies[match[1]] = match[2];
    }
  }
  return cookies;
}

async function followRedirectsWithCookies(url: string, init: RequestInit, maxRedirects = 8) {
  let currentUrl = url;
  const cookies: CookieMap = cookieHeaderToMap(
    init.headers instanceof Headers ? init.headers.get("Cookie") : null
  );
  let currentInit: RequestInit = { ...init, redirect: "manual" };
  let lastResponse: Response | null = null;

  for (let i = 0; i <= maxRedirects; i++) {
    const headers = new Headers(currentInit.headers ?? {});
    const cookieHeader = cookieMapToHeader(cookies);
    if (cookieHeader) headers.set("Cookie", cookieHeader);

    const response = await fetch(currentUrl, { ...currentInit, headers });
    lastResponse = response;
    Object.assign(cookies, extractSetCookies(response.headers));

    const location = response.headers.get("location");
    if (!location || ![301, 302, 303, 307, 308].includes(response.status)) {
      return { response, cookies };
    }

    currentUrl = new URL(location, currentUrl).toString();
    currentInit = {
      method: response.status === 307 || response.status === 308 ? (currentInit.method || "GET") : "GET",
      headers,
      body: response.status === 307 || response.status === 308 ? currentInit.body : undefined,
      redirect: "manual",
    };
  }

  if (!lastResponse) {
    throw new Error("Redirect chain failed");
  }

  return { response: lastResponse, cookies };
}

function getAccount(fields: FetchDdlFields): string {
  return String(fields.account || fields.username || fields.email || fields.studentid || "");
}

function normalizeHydroBaseUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim().replace(/\/$/, "");
  if (!trimmed) {
    throw new Error("Hydro: url is required");
  }

  try {
    const parsed = new URL(trimmed);
    if (!/^\/d\/[^/]+\/?$/i.test(parsed.pathname)) {
      throw new Error(
        "Hydro: URL must look like http://10.15.21.133/d/SI100B_2025_Autumn/ and must not include homework/login paths"
      );
    }
    if (/\/(login|homework)(\/|$)/i.test(parsed.pathname)) {
      throw new Error(
        "Hydro: URL must point to the platform root, not a login/homework path"
      );
    }
    return `${parsed.origin}${parsed.pathname.replace(/\/$/, "")}`;
  } catch {
    throw new Error("Hydro: url must be a valid absolute URL like http://10.15.21.133/d/SI100B_2025_Autumn/");
  }
}

async function fetchWithCookies(url: string, init: RequestInit = {}, cookies?: CookieMap | string[]) {
  const headers = new Headers(init.headers ?? {});
  const cookieHeader = cookieMapToHeader(cookies);
  if (cookieHeader) headers.set("Cookie", cookieHeader);
  return fetch(url, { ...init, headers, redirect: "follow" });
}

function encryptEgatePassword(password: string, salt: string): string {
  const paddedPassword = Buffer.concat([
    Buffer.from("Nu1L".repeat(16), "ascii"),
    Buffer.from(password, "utf-8"),
  ]);
  const blockSize = 16;
  const padLen = blockSize - (paddedPassword.length % blockSize);
  const pkcs7Padded = Buffer.concat([
    paddedPassword,
    Buffer.alloc(padLen, padLen),
  ]);
  const iv = Buffer.from("Nu1L".repeat(4), "ascii");
  const cipher = crypto.createCipheriv("aes-128-cbc", Buffer.from(salt, "utf-8"), iv);
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(pkcs7Padded), cipher.final()]).toString("base64");
}

async function loginBlackboardViaEgate(studentId: string, password: string): Promise<CookieMap> {
  const loginUrl =
    "https://ids.shanghaitech.edu.cn/authserver/login?service=https%3A%2F%2Felearning.shanghaitech.edu.cn%3A8443%2Fwebapps%2Fbb-BB-BBLEARN%2Findex.jsp";

  const pageResp = await fetch(loginUrl, {
    headers: { "User-Agent": "Mozilla/5.0" },
    redirect: "follow",
  });
  const pageHtml = await pageResp.text();
  const pageCookies = extractSetCookies(pageResp.headers);

  const extractFormField = (html: string, name: string): string => {
    const isId = name === "pwdEncryptSalt";
    const needle = isId ? `id="${name}"` : `name="${name}"`;
    const startIdx = html.indexOf(needle);
    if (startIdx === -1) throw new Error(`Blackboard: IDS field "${name}" not found`);
    const endIdx = html.indexOf("/>", startIdx);
    const raw = html.slice(startIdx, endIdx);
    const valueMatch = raw.match(/value="([^"]*)"/);
    return valueMatch ? valueMatch[1] : "";
  };

  const lt = extractFormField(pageHtml, "lt");
  const execution = extractFormField(pageHtml, "execution");
  const salt = extractFormField(pageHtml, "pwdEncryptSalt");

  if (!execution || !salt) {
    throw new Error("Blackboard: failed to load IDS login page");
  }

  const encryptedPwd = encryptEgatePassword(password, salt);
  const formData = new URLSearchParams({
    username: studentId,
    password: encryptedPwd,
    lt,
    dllt: "generalLogin",
    execution,
    _eventId: "submit",
    rmShown: "1",
  });

  const { response: postResp, cookies: loginRedirectCookies } = await followRedirectsWithCookies(
    loginUrl,
    {
      method: "POST",
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: cookieMapToHeader(pageCookies),
        "sec-ch-ua": '"Not/A)Brand";v="99", "Microsoft Edge";v="115", "Chromium";v="115"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
      },
      body: formData.toString(),
    }
  );

  const loginHtml = await postResp.text();
  const loginCookies = {
    ...pageCookies,
    ...loginRedirectCookies,
  };

  const inputData: Record<string, string> = {};
  const inputRegex = /<input[^>]*name="([^"]+)"[^>]*value="([^"]*)"[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = inputRegex.exec(loginHtml))) {
    inputData[match[1]] = match[2];
  }

  if (Object.keys(inputData).length === 0) {
    throw new Error("Blackboard: eGate login did not produce SSO form");
  }

  const { cookies: customLoginCookies } = await followRedirectsWithCookies(
    "https://elearning.shanghaitech.edu.cn:8443/webapps/bb-sso-BBLEARN/execute/authValidate/customLogin",
    {
      method: "POST",
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: cookieMapToHeader(loginCookies),
      },
      body: new URLSearchParams(inputData).toString(),
    }
  );

  const mergedCookies = {
    ...loginCookies,
    ...customLoginCookies,
  };

  const mainPageResp = await fetch(
    "https://elearning.shanghaitech.edu.cn:8443/webapps/bb-BB-BBLEARN/index.jsp",
    {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Cookie: cookieMapToHeader(mergedCookies),
      },
      redirect: "follow",
    }
  );

  const mainPageCookies = extractSetCookies(mainPageResp.headers);
  const finalCookies = {
    ...mergedCookies,
    ...mainPageCookies,
  };

  if (!finalCookies.session_id && !finalCookies.s_session_id && finalCookies.JSESSIONID) {
    finalCookies.session_id = finalCookies.JSESSIONID;
  }

  if (!finalCookies.session_id && !finalCookies.s_session_id) {
    throw new Error("Blackboard: login succeeded but no session cookies were established");
  }

  return finalCookies;
}

function getString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

export async function loginHydroSession(url: string, username: string, password: string): Promise<CookieMap> {
  const base = normalizeHydroBaseUrl(url);
  const loginUrl = `${base}/login`;
  const form = new URLSearchParams();
  form.set("uname", username);
  form.set("password", password);
  form.set("rememberme", "on");
  form.set("tfa", "");
  form.set("authnChallenge", "");
  form.set("login_submit", "登录");

  const resp = await fetch(loginUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
    redirect: "manual",
  });

  const setCookies = resp.headers.getSetCookie?.() ?? [];
  const cookies: Record<string, string> = {};
  for (const sc of setCookies) {
    const m = sc.match(/^([^=]+)=([^;]*)/);
    if (m) cookies[m[1]] = m[2];
  }

  const hwResp = await fetchWithCookies(
    `${base}/homework`,
    { headers: { Accept: "application/json" } },
    cookies
  );
  if (!hwResp.ok) throw new Error("Hydro: failed to fetch homework");

  return cookies;
}

export async function loginGradescopeSession(email: string, password: string): Promise<CookieMap> {
  const form = new FormData();
  form.set("email", email);
  form.set("password", password);

  const loginResp = await fetch("https://www.gradescope.com/api/mobile/v1/user_session", {
    method: "POST",
    headers: {
      "User-Agent": "Mozilla/5.0",
      Accept: "application/json",
    },
    body: form,
  });

  if (!loginResp.ok) {
    throw new Error(`Gradescope: mobile login failed (${loginResp.status})`);
  }

  let loginPayload: Record<string, unknown>;
  try {
    loginPayload = await loginResp.json();
  } catch {
    throw new Error("Gradescope: mobile login returned invalid JSON");
  }

  const accessToken = getString(loginPayload.api_token);
  if (!accessToken) {
    throw new Error("Gradescope: mobile login response missing api_token");
  }

  const cookies: CookieMap = {
    ...extractSetCookies(loginResp.headers),
    "access-token": accessToken,
  };
  const sid = getString(loginPayload.sid);
  if (sid) cookies.sid = sid;

  return cookies;
}

export async function loginBlackboardSession(studentId: string, password: string): Promise<CookieMap> {
  return loginBlackboardViaEgate(studentId, password);
}

// Hydro: supports { url, username, password } or { session: CookieMap }
export async function fetchHydro(fields: FetchDdlFields): Promise<DeadlineItem[]> {
  const base = normalizeHydroBaseUrl(String(fields.url || ""));
  const username = getAccount(fields);
  const password = String(fields.password || "");

  const session = fields.session as CookieMap | undefined;

  if (!session) {
    const cookies = await loginHydroSession(base, username, password);

    const hwResp = await fetchWithCookies(
      `${base}/homework`,
      { headers: { Accept: "application/json" } },
      cookies
    );
    if (!hwResp.ok) throw new Error("Hydro: failed to fetch homework");
    const payload = await hwResp.json();
    const arr = Array.isArray(payload) ? payload : payload.calendar ?? payload.tdocs ?? [];

    return (arr as any[]).map((item) => {
      const endAt = item.endAt || item.dueAt || item.due || null;
      const due = endAt ? Math.floor(new Date(String(endAt)).getTime() / 1000) : 0;
      const assign = Array.isArray(item.assign) ? item.assign : [];
      const course = assign[0] || item.domainName || item.domainId || "Hydro";
      const title = item.title || item.docTitle || item._id || "Untitled";
      let url = item.url || null;
      if (typeof url === "string" && url && !url.startsWith("http")) url = base + url;
      return {
        platform: "Hydro",
        title,
        course,
        due,
        status: item.status || "Live",
        url,
      } as DeadlineItem;
    });
  } else {
    const resp = await fetchWithCookies(`${base}/homework`, { headers: { Accept: "application/json" } }, session);
    if (!resp.ok) throw new Error("Hydro: failed to fetch homework with session");
    const payload = await resp.json();
    const arr = Array.isArray(payload) ? payload : payload.calendar ?? payload.tdocs ?? [];
    return (arr as any[]).map((item) => {
      const endAt = item.endAt || item.dueAt || item.due || null;
      const due = endAt ? Math.floor(new Date(String(endAt)).getTime() / 1000) : 0;
      const assign = Array.isArray(item.assign) ? item.assign : [];
      const course = assign[0] || item.domainName || item.domainId || "Hydro";
      const title = item.title || item.docTitle || item._id || "Untitled";
      let url = item.url || null;
      if (typeof url === "string" && url && !url.startsWith("http")) url = base + url;
      return {
        platform: "Hydro",
        title,
        course,
        due,
        status: item.status || "Live",
        url,
      } as DeadlineItem;
    });
  }
}

// Gradescope: supports { email, password } or { session: CookieMap }
export async function fetchGradescope(fields: FetchDdlFields): Promise<DeadlineItem[]> {
  const base = "https://www.gradescope.com";
  const session = fields.session as CookieMap | undefined;
  const email = getAccount(fields);
  const password = String(fields.password || "");

  type GradescopeCourse = Record<string, unknown>;
  type GradescopeAssignment = Record<string, unknown>;

  const firstString = (item: Record<string, unknown> | undefined, keys: string[]): string => {
    if (!item) return "";
    for (const key of keys) {
      const value = getString(item[key]);
      if (value) return value;
    }
    return "";
  };

  const toArray = (value: unknown): unknown[] => {
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      if (Array.isArray(record.data)) return record.data;
      if (Array.isArray(record.courses)) return record.courses;
      if (Array.isArray(record.assignments)) return record.assignments;
      if (Array.isArray(record.items)) return record.items;
      if (Array.isArray(record.results)) return record.results;
    }
    return [];
  };

  const parseDue = (item: GradescopeAssignment): number => {
    const rawValue = item.due_date ?? item.final_due_date ?? item.hard_due_date ?? item.dueDate ?? item.finalDueDate ?? item.hardDueDate;
    if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
      return rawValue > 1e12 ? Math.floor(rawValue / 1000) : Math.floor(rawValue);
    }
    const rawText = getString(rawValue);
    if (!rawText) return 0;
    const parsed = Date.parse(rawText);
    if (!Number.isFinite(parsed)) return 0;
    return Math.floor(parsed / 1000);
  };

  const parseSubmitted = (item: GradescopeAssignment): boolean | undefined => {
    const submission = item.submission && typeof item.submission === "object" ? (item.submission as Record<string, unknown>) : undefined;
    const candidates = [
      submission?.submitted,
      item.submitted,
      item.is_submitted,
      item.has_submission,
      item.hasSubmission,
      item.student_submission,
      item.status,
    ];
    for (const candidate of candidates) {
      if (typeof candidate === "boolean") return candidate;
      const text = getString(candidate).toLowerCase();
      if (!text) continue;
      if (["submitted", "turned in", "complete", "completed", "yes", "true"].includes(text)) return true;
      if (["not submitted", "no submission", "missing", "false", "no"].includes(text)) return false;
    }
    return undefined;
  };

  const parseStatus = (item: GradescopeAssignment): string | null => {
    const submission = item.submission && typeof item.submission === "object" ? (item.submission as Record<string, unknown>) : undefined;
    const text =
      firstString(submission, ["status"]) ||
      firstString(item, ["status", "submission_status", "grading_status", "submissionStatus"]);
    if (text) return text;

    const submitted = parseSubmitted(item);
    if (typeof submitted === "boolean") {
      return submitted ? "submitted" : "not submitted";
    }

    return null;
  };

  const parseName = (item: Record<string, unknown>, fallbackKeys: string[]): string => {
    return firstString(item, ["name", "title", "assignment_name", "assignmentName", ...fallbackKeys]);
  };

  let accessToken = "";
  const requestCookies: CookieMap = {};

  if (session) {
    Object.assign(requestCookies, session);
    accessToken =
      session["access-token"] ||
      session["access_token"] ||
      session["api_token"] ||
      session["api-token"] ||
      session["X-Api-Token"] ||
      session["x-api-token"] ||
      "";
  } else if (email && password) {
    const sessionCookies = await loginGradescopeSession(email, password);
    Object.assign(requestCookies, sessionCookies);
    accessToken =
      sessionCookies["access-token"] ||
      sessionCookies["access_token"] ||
      sessionCookies["api_token"] ||
      sessionCookies["api-token"] ||
      sessionCookies["X-Api-Token"] ||
      sessionCookies["x-api-token"] ||
      "";
  } else {
    throw new Error("Gradescope: missing session or email/password");
  }

  if (!accessToken) {
    throw new Error("Gradescope: missing access token");
  }

  const requestHeaders = new Headers({
    "User-Agent": "Mozilla/5.0",
    Accept: "application/json",
    "access-token": accessToken,
  });
  const cookieHeader = cookieMapToHeader(requestCookies);
  if (cookieHeader) {
    requestHeaders.set("Cookie", cookieHeader);
  }

  const fetchJson = async (path: string): Promise<unknown> => {
    const response = await fetch(`${base}${path}`, { headers: requestHeaders });
    if (!response.ok) {
      throw new Error(`Gradescope: request failed (${response.status}) for ${path}`);
    }
    return response.json();
  };

  const coursePayload = await fetchJson("/api/mobile/v1/courses/");
  const courseRecords = toArray(coursePayload).filter((item): item is GradescopeCourse => Boolean(item && typeof item === "object"));

  const items: DeadlineItem[] = [];
  for (const course of courseRecords) {
    const courseId = firstString(course, ["id", "course_id", "courseId", "course_number", "courseNumber", "url"]);
    if (!courseId) continue;

    const courseName = parseName(course, ["short_name", "shortName", "course_name", "courseName", "display_name", "displayName"]) || courseId;

    const assignmentsPayload = await fetchJson(`/api/mobile/v1/courses/${encodeURIComponent(courseId)}/assignments`);
    const assignmentRecords = toArray(assignmentsPayload).filter(
      (item): item is GradescopeAssignment => Boolean(item && typeof item === "object")
    );

    for (const assignment of assignmentRecords) {
      const due = parseDue(assignment);
      if (!due) continue;

      const title = parseName(assignment, ["assignment_title", "assignmentTitle", "display_name", "displayName"]);
      if (!title) continue;

      const assignmentId = firstString(assignment, ["id", "assignment_id", "assignmentId"]);
      items.push({
        platform: "Gradescope",
        title,
        course: courseName,
        due,
        status: parseStatus(assignment),
        url: assignmentId ? `${base}/courses/${encodeURIComponent(courseId)}/assignments/${encodeURIComponent(assignmentId)}` : `${base}/courses/${encodeURIComponent(courseId)}`,
      });
    }
  }

  return items;
}

// Blackboard: credentials login supported via studentid/password, session cookies also accepted.
export async function fetchBlackboard(fields: FetchDdlFields): Promise<DeadlineItem[]> {
  const session = fields.session as CookieMap | undefined;
  const studentId = getAccount(fields);
  const password = String(fields.password || "");

  const base = fields.baseUrl ? String(fields.baseUrl).replace(/\/$/, "") : "https://elearning.shanghaitech.edu.cn:8443";
  const url = `${base}/webapps/calendar/calendarData/allCourseEvents?start=${Date.now()}`;

  let effectiveSession = session;
  if (!effectiveSession) {
    if (!studentId || !password) {
      throw new Error("Blackboard: studentid/password or session cookies are required");
    }
    effectiveSession = await loginBlackboardViaEgate(studentId, password);
  }

  const resp = await fetch(url, { headers: { Cookie: cookieMapToHeader(effectiveSession), "User-Agent": "Mozilla/5.0" } });

  if (!resp.ok) {
    if (resp.status === 500) {
      console.warn("[Blackboard] Calendar API returned 500, returning empty list");
      return [];
    }
    throw new Error("Blackboard: failed to fetch calendar");
  }

  const data = await resp.json();
  if (!Array.isArray(data)) return [];

  return data.map((item: any) => ({
    platform: "Blackboard",
    title: item.title || "",
    course: item.calendarName || "",
    due: item.end ? Math.floor(new Date(String(item.end)).getTime() / 1000) : 0,
    status: item.attemptable ? "Attemptable" : "Unattemptable",
    url: item.itemSourceId ? `${base}/webapps/calendar/launch/attempt/_blackboard.platform.gradebook2.GradableItem-${item.itemSourceId}` : null,
  } as DeadlineItem));
}

export async function fetchPlatform(platform: string, fields: Record<string, unknown>): Promise<DeadlineItem[]> {
  switch (platform.toLowerCase()) {
    case "hydro":
      return fetchHydro(fields);
    case "gradescope":
      return fetchGradescope(fields);
    case "blackboard":
      return fetchBlackboard(fields);
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

export default fetchPlatform;
