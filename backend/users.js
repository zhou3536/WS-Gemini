
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataFilePath = path.join(__dirname, 'users.json');
// ---- 辅助函数：读取 json ----
function readDataFile() {
    try {
        const data = fs.readFileSync(dataFilePath, 'utf-8');
        const jsonData = JSON.parse(data);
        return jsonData;
    } catch (error) {
        console.error(`Error reading data file ${dataFilePath}:`, error);
        return [];
    }
}
// ---- 辅助函数：写入 a.json ----
function writeDataFile(data) {
    try {
        fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2), 'utf-8');
        console.log('Successfully wrote ');
    } catch (error) {
        console.error('Error writing ', error);
    }
}
let users = [];

// 存验证码信息：{ email: { code, createdAt, attempts } }
const codes = {};

// 定时清理任务（每分钟）
setInterval(() => {
    const now = Date.now();
    for (const email in codes) {
        if (now - codes[email].createdAt > 10 * 60 * 1000) { // 超过10分钟
            delete codes[email];
        }
    }
}, 60 * 1000);

// 生成 6 位数字
function generateCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// 模拟发送验证码
function sendcode(email, code) {
    console.log(`发送给 ${email} 的验证码: ${code}`);
}

// 获取验证码
const getcode = (req, res) => {
    const email = req.body.email.toLowerCase();
    const now = Date.now();
    if (users.some(item => item.username === email)) {
        return res.status(409).json({ message: '该邮箱已经注册过了' });
    }
    // 限流：60秒内不能重复获取
    if (codes[email] && (now - codes[email].createdAt) < 60 * 1000) {
        return res.status(429).json({ message: '请求过于频繁，请稍后再试' });
    }

    // 生成并保存验证码
    codes[email] = {
        code: generateCode(),
        createdAt: now,
        attempts: 0
    };

    sendcode(email, codes[email].code);
    res.json({ message: '发送成功，请查看邮箱' });
};

// 验证验证码
const postcode = (req, res) => {
    const { email: email, pwd: pwd, code: code } = req.body;
    // const email = req.body.email.toLowerCase();
    // const code = req.body.code;
    const record = codes[email];
    if (users.some(item => item.username === email)) {
        return res.status(409).json({ message: '该邮箱已经注册过了' });
    }
    if (!record) {
        return res.status(400).json({ message: '验证码不存在，请重新获取' });
    }

    // 过期判断
    if (Date.now() - record.createdAt > 10 * 60 * 1000) {
        delete codes[email];
        return res.status(400).json({ message: '验证码已过期' });
    }

    // 验证码错误处理
    if (record.code !== code) {
        record.attempts++;
        if (record.attempts >= 5) {
            delete codes[email];
            return res.status(429).json({ message: '验证码错误次数过多，请重新获取' });
        }
        return res.status(400).json({ message: '验证码错误' });
    }

    // 验证成功
    delete codes[email];
    const newUserId = generateUniqueUserId(users);
    users.push({ username: email, password: pwd, userId: newUserId, API_KEY: "" });
    writeDataFile(users);
    res.json({ message: '创建账号成功' });

};
//生成id函数
function generateUniqueUserId(users) {
    const existingIds = new Set(users.map(user => user.userId));
    let newId;
    do {
        // 生成4位随机数字字符串，格式如 "0345"
        newId = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    } while (existingIds.has(newId));
    return newId;
}
//初始化
const initializeUsers = (app, initialUsers) => {
    users = initialUsers;
    if (!initialUsers) {
        console.error('ERROR: Not Users');
        process.exit(1);
    }
    app.post('/api/getcode', getcode);
    app.post('/api/postcode', postcode);

    // 启动定期清理任务
    console.log('用户模块已初始化...');
};

export { initializeUsers };