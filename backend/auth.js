// auth.js
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';

// __dirname 在 ES Module 中不可用，需要手动创建
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 从环境变量获取配置
let COOKIE_SECRET; // 只需 COOKIE_SECRET
const AUTH_COOKIE_NAME = 'access_granted';
const SESSION_DURATION_MS = 240 * 60 * 60 * 1000; // 240小时 = 10天

// --- 用户数据硬编码 (明文密码，仅供测试) ---
const users = [
    { username: '100', password: '1000', userId: 'user_001' },
    { username: '200', password: '2000', userId: 'user_002' },
    // 可以继续添加更多用户
];

const USER_ID_COOKIE_NAME = 'user_id'; // 新增一个 cookie 名称用于存储用户ID

// --- 速率限制相关配置和存储 ---
const loginAttemptTimestamps = new Map();
const LOGIN_RATE_LIMIT_INTERVAL_MS = 10 * 1000;
const MAX_AGE_FOR_ATTEMPTS_MS = LOGIN_RATE_LIMIT_INTERVAL_MS * 2;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 每5分钟清理一次

// 辅助函数：获取客户端IP地址，考虑代理
const getClientIp = (req) => {
    // 优先检查 X-Forwarded-For
    const forwardedFor = req.headers['x-forwarded-for'];
    if (forwardedFor) {
        return forwardedFor.split(',')[0].trim();
    }
    // 检查 X-Real-IP
    const realIp = req.headers['x-real-ip'];
    if (realIp) {
        return realIp.trim();
    }
    // 如果都没有，使用 req.ip (Express 默认连接IP)
    // 注意：如果 Express app.set('trust proxy') 未配置或配置不当，
    // req.ip 可能是反向代理的IP，而不是真实客户端IP。
    return req.ip;
};

// 速率限制中间件，专门用于登录路由
const loginRateLimitMiddleware = (req, res, next) => {
    const clientIp = getClientIp(req);
    const lastAttemptTime = loginAttemptTimestamps.get(clientIp);
    const currentTime = Date.now();

    if (lastAttemptTime && (currentTime - lastAttemptTime < LOGIN_RATE_LIMIT_INTERVAL_MS)) {
        const remainingTimeSeconds = Math.ceil((LOGIN_RATE_LIMIT_INTERVAL_MS - (currentTime - lastAttemptTime)) / 1000);
        // console.warn(`[RATE LIMIT] IP: ${clientIp} - Too many login attempts. Remaining: ${remainingTimeSeconds}s`);
        return res.status(429).json({
            message: `请${remainingTimeSeconds}秒后重试`,
            retryAfter: remainingTimeSeconds
        });
    }

    loginAttemptTimestamps.set(clientIp, currentTime); // 记录当前尝试的时间
    next();
};

// 定期清理 loginAttemptTimestamps Map 中的旧条目
const cleanupLoginAttempts = () => {
    const currentTime = Date.now();
    let cleanedCount = 0;
    for (const [ip, timestamp] of loginAttemptTimestamps.entries()) {
        if (currentTime - timestamp > MAX_AGE_FOR_ATTEMPTS_MS) {
            loginAttemptTimestamps.delete(ip);
            cleanedCount++;
        }
    }
    if (cleanedCount > 0) {
        console.log(`[CLEANUP] Cleaned up ${cleanedCount} expired login attempt entries. Current map size: ${loginAttemptTimestamps.size}`);
    }
};

// --- 认证中间件和路由处理函数 ---

const authenticateMiddleware = (req, res, next) => {
    // 白名单路径，不需要认证
    const publicPaths = [
        '/login.html',
        '/api/login',
        '/api/logout',
        '/theme.js',
        '/color.css',
        '/favicon.ico',
        '/manifest.json'
    ];

    // 如果请求路径在白名单中，直接放行
    if (publicPaths.includes(req.path)) {
        return next();
    }

    // 检查是否存在认证 Cookie 和用户 ID Cookie
    if (req.signedCookies[AUTH_COOKIE_NAME] === 'true' && req.signedCookies[USER_ID_COOKIE_NAME]) {
        // 如果认证 Cookie 和用户 ID Cookie 都存在且有效，检查是否需要续期
        res.cookie(AUTH_COOKIE_NAME, 'true', {
            maxAge: SESSION_DURATION_MS,
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            signed: true,
            sameSite: 'Lax'
        });
        res.cookie(USER_ID_COOKIE_NAME, req.signedCookies[USER_ID_COOKIE_NAME], { // 续期用户ID Cookie
            maxAge: SESSION_DURATION_MS,
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            signed: true,
            sameSite: 'Lax'
        });
        return next();
    }

    if (req.path.startsWith('/api')) {
        return res.status(401).json({ message: 'Unauthorized. Please log in to access this resource.' });
    }

    res.status(401).sendFile(path.join(__dirname, 'public', 'login.html'));
};

// 登录路由处理函数
const loginRoute = (req, res) => {
    const { username, password } = req.body; // 接收 username 和 password
    const clientIp = getClientIp(req); // 获取客户端IP

    if (!COOKIE_SECRET) {
        console.error('Authentication configuration missing: COOKIE_SECRET not set.');
        console.error(`[LOGIN ERROR] IP: ${clientIp} - Server authentication not configured.`);
        return res.status(500).json({ message: 'Server authentication not configured.' });
    }

    const foundUser = users.find(user => user.username === username);

    // 直接比较明文密码
    if (foundUser && foundUser.password === password) {
        res.cookie(AUTH_COOKIE_NAME, 'true', {
            maxAge: SESSION_DURATION_MS,
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            signed: true,
            sameSite: 'Lax'
        });
        // 设置用户 ID Cookie
        res.cookie(USER_ID_COOKIE_NAME, foundUser.userId, {
            maxAge: SESSION_DURATION_MS,
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            signed: true,
            sameSite: 'Lax'
        });

        loginAttemptTimestamps.set(clientIp, Date.now()); // 登录成功后，更新时间戳
        console.log(`IP: ${clientIp} - User ${username} login successful. UserID: ${foundUser.userId}`);
        return res.status(200).json({ message: '登录成功' });
    } else {
        loginAttemptTimestamps.set(clientIp, Date.now()); // 密码错误，更新时间戳
        console.warn(`IP: ${clientIp} - Login failed for username: ${username}`);
        return res.status(401).json({ message: '登录失败' });
    }
};

// 登出路由处理函数
const logoutRoute = (req, res) => {
    res.clearCookie(AUTH_COOKIE_NAME, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        signed: true,
        sameSite: 'Lax'
    });
    res.clearCookie(USER_ID_COOKIE_NAME, { // 清除用户 ID Cookie
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        signed: true,
        sameSite: 'Lax'
    });

    const clientIp = getClientIp(req);
    // 获取当前请求中的用户 ID，用于日志记录
    const loggedOutUserId = req.signedCookies[USER_ID_COOKIE_NAME] || 'unknown';
    console.log(`IP: ${clientIp} - User ${loggedOutUserId} logged out successfully.`);
    return res.status(200).json({ message: '退出成功' });
};


//初始化认证模块并将其应用于Express应用。
const initializeAuth = (app, accessPassword, cookieSecret) => {
    COOKIE_SECRET = cookieSecret;
    if (!COOKIE_SECRET) {
        console.error('ERROR: COOKIE_SECRET environment variable is not set!');
        console.error('Please set it in your .env file.');
        process.exit(1);
    }

    app.use(cookieParser(COOKIE_SECRET));
    app.use(authenticateMiddleware);
    app.post('/api/login', loginRateLimitMiddleware, loginRoute);
    app.post('/api/logout', logoutRoute);

    setInterval(cleanupLoginAttempts, CLEANUP_INTERVAL_MS);
    console.log('Authentication module initialized.');
};

export { initializeAuth };