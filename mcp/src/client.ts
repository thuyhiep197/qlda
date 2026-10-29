/**
 * Gọi REST API của QLDA bằng tài khoản người dùng: đăng nhập lấy cookie qlda_token, hết hạn thì đăng nhập lại.
 * Mọi thao tác đi qua API nên vẫn theo đúng phân quyền, workflow và nhật ký của QLDA.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const COOKIE = 'qlda_token';

export class QldaError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

type Query = Record<string, string | number | boolean | undefined | null | (string | number)[]>;

export class QldaClient {
  private token: string | null;
  private loggingIn: Promise<void> | null = null;
  private loginError: string | null = null;

  constructor(
    readonly baseUrl: string,
    private username?: string,
    private password?: string,
    token?: string,
    private apiKey?: string,
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.token = token || null;
  }

  static fromEnv() {
    const url = process.env.QLDA_URL || 'http://localhost:3001';
    const c = new QldaClient(url, process.env.QLDA_USERNAME, process.env.QLDA_PASSWORD, process.env.QLDA_TOKEN, process.env.QLDA_API_KEY);
    if (!c.apiKey && !c.token && !(c.username && c.password)) {
      throw new Error('Thiếu thông tin đăng nhập: đặt QLDA_API_KEY (tạo trong Hồ sơ → Bảo mật), hoặc QLDA_USERNAME + QLDA_PASSWORD');
    }
    return c;
  }

  /** Đăng nhập đúng một lần dù nhiều request cùng gặp 401; sai mật khẩu thì KHÔNG thử lại (QLDA khóa tài khoản sau 5 lần sai). */
  private login() {
    if (this.loginError) return Promise.reject(new QldaError(401, `${this.loginError} — sửa QLDA_USERNAME/QLDA_PASSWORD rồi khởi động lại MCP server`));
    if (!this.username || !this.password) return Promise.reject(new QldaError(401, 'Phiên QLDA_TOKEN đã hết hạn và không có QLDA_USERNAME/QLDA_PASSWORD để đăng nhập lại'));
    this.loggingIn ??= (async () => {
      const res = await fetch(`${this.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: this.username, password: this.password }),
      });
      if (!res.ok) {
        const msg = await errorMessage(res);
        // Không dùng lại mật khẩu sai cho các lần sau
        this.loginError = `Đăng nhập QLDA thất bại: ${msg}`;
        throw new QldaError(res.status, this.loginError);
      }
      const cookie = res.headers.getSetCookie().find((c) => c.startsWith(`${COOKIE}=`));
      if (!cookie) throw new QldaError(500, 'Máy chủ không trả về cookie đăng nhập');
      this.token = cookie.slice(COOKIE.length + 1).split(';')[0];
    })().finally(() => { this.loggingIn = null; });
    return this.loggingIn;
  }

  private async send(method: string, apiPath: string, query: Query | undefined, init: { body?: BodyInit; json?: unknown }) {
    if (!this.apiKey && !this.token) await this.login();
    const url = buildUrl(this.baseUrl, apiPath, query);
    const go = () => {
      const headers: Record<string, string> = this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : { Cookie: `${COOKIE}=${this.token}` };
      let body = init.body;
      if (init.json !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(init.json); }
      return fetch(url, { method, headers, body });
    };
    let res = await go();
    if (res.status === 401 && !this.apiKey && this.username && this.password) {
      this.token = null;
      await this.login();
      res = await go();
    }
    if (!res.ok) throw new QldaError(res.status, await errorMessage(res));
    return res;
  }

  async request<T = any>(method: string, apiPath: string, opts: { query?: Query; body?: unknown } = {}): Promise<T> {
    const res = await this.send(method, apiPath, opts.query, { json: opts.body });
    const text = await res.text();
    if (!text) return { ok: true } as T;
    try { return JSON.parse(text) as T; } catch { return text as T; }
  }

  get<T = any>(p: string, query?: Query) { return this.request<T>('GET', p, { query }); }
  post<T = any>(p: string, body?: unknown, query?: Query) { return this.request<T>('POST', p, { body: body ?? {}, query }); }
  patch<T = any>(p: string, body: unknown) { return this.request<T>('PATCH', p, { body }); }
  put<T = any>(p: string, body: unknown) { return this.request<T>('PUT', p, { body }); }
  del<T = any>(p: string) { return this.request<T>('DELETE', p); }

  /** Tải tệp trên máy lên (multipart, trường `field`). */
  async upload<T = any>(apiPath: string, field: string, filePaths: string[], query?: Query): Promise<T> {
    const form = new FormData();
    for (const fp of filePaths) {
      const data = await fs.readFile(fp);
      form.append(field, new Blob([data]), path.basename(fp));
    }
    const res = await this.send('POST', apiPath, query, { body: form });
    return res.json() as Promise<T>;
  }

  /** Tải tệp từ QLDA về máy, trả về đường dẫn đã lưu. */
  async download(apiPath: string, saveTo: string, query?: Query) {
    const res = await this.send('GET', apiPath, query, {});
    let target = path.resolve(saveTo);
    const isDir = await fs.stat(target).then((s) => s.isDirectory()).catch(() => saveTo.endsWith('/') || saveTo.endsWith('\\'));
    if (isDir) target = path.join(target, filenameFrom(res.headers.get('content-disposition')) || 'download.bin');
    await fs.mkdir(path.dirname(target), { recursive: true });
    const buf = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(target, buf);
    return { path: target, size: buf.length, mime: res.headers.get('content-type') };
  }
}

function buildUrl(base: string, apiPath: string, query?: Query) {
  const p = apiPath.startsWith('/api/') ? apiPath : `/api/${apiPath.replace(/^\/+/, '')}`;
  const url = new URL(base + p);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v === undefined || v === null || v === '') continue;
    url.searchParams.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  return url.toString();
}

async function errorMessage(res: Response) {
  const text = await res.text().catch(() => '');
  try { return JSON.parse(text).error || text || res.statusText; } catch { return text || `${res.status} ${res.statusText}`; }
}

function filenameFrom(disposition: string | null) {
  const m = disposition?.match(/filename\*=UTF-8''([^;]+)/i) ?? disposition?.match(/filename="?([^";]+)"?/i);
  return m ? path.basename(decodeURIComponent(m[1])) : null;
}
