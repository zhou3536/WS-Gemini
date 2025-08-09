
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

// 公共方法：获取验证码
function handleGetCode(email, shouldExist, Invitationcode) {
    const now = Date.now();
    const exists = users.some(item => item.username === email);

    if (shouldExist && !exists) {
        return { error: '该邮箱不存在' };
    }
    if (!shouldExist && exists) {
        return { error: '该邮箱已经注册过了' };
    }

    // 限流
    if (codes[email] && (now - codes[email].createdAt) < 60 * 1000) {
        return { error: '请求过于频繁，请稍后再试' };
    }
    // 生成验证码
    codes[email] = {
        code: generateCode(),
        createdAt: now,
        attempts: 0
    };
    if (Invitationcode !== 'aa202508' && !shouldExist) {
        return { error: '邀请码错误，请联系管理员' }
    }
    
    sendcode(email, codes[email].code);
    return { success: true };
}

// 公共方法：验证验证码
function handlePostCode(email, code, onSuccess) {
    const record = codes[email];
    if (!record) {
        return { error: '验证码不存在，请重新获取' };
    }

    // 验证码过期
    if (Date.now() - record.createdAt > 10 * 60 * 1000) {
        delete codes[email];
        return { error: '验证码已过期' };
    }

    // 验证码错误
    if (record.code !== code) {
        record.attempts++;
        if (record.attempts >= 5) {
            delete codes[email];
            return { error: '验证码错误次数过多，请重新获取' };
        }
        return { error: '验证码错误' };
    }

    // 验证成功
    delete codes[email];
    onSuccess();
    return { success: true };
}


// ===== 注册账号 =====
const getcode = (req, res) => {
    const email = req.body.email.toLowerCase();
    const Invitationcode = req.body.Invitationcode;
    // if (Invitationcode !== 'aa202508') return res.status(400).json({ message: '邀请码错误，请联系管理员' });

    const result = handleGetCode(email, false, Invitationcode);
    if (result.error) return res.status(400).json({ message: result.error });
    res.json({ message: '发送成功，请查看邮箱' });
};

const postcode = (req, res) => {
    const { email, pwd, code } = req.body;
    const result = handlePostCode(email, code, () => {
        const newUserId = generateUniqueUserId(users);
        users.push({ username: email, password: pwd, userId: newUserId, API_KEY: "" });
        writeDataFile(users);
    });
    if (result.error) return res.status(400).json({ message: result.error });
    res.json({ message: '创建账号成功' });
};

// ===== 修改密码 =====
const getcode2 = (req, res) => {
    const email = req.body.email.toLowerCase();
    const result = handleGetCode(email, true); // 修改密码模式
    if (result.error) return res.status(400).json({ message: result.error });
    res.json({ message: '发送成功，请查看邮箱' });
};

const postcode2 = (req, res) => {
    const { email, pwd, code } = req.body;
    const result = handlePostCode(email, code, () => {
        const user = users.find(u => u.username === email);
        if (user) {
            user.password = pwd;
            writeDataFile(users);
        }
    });
    if (result.error) return res.status(400).json({ message: result.error });
    res.json({ message: '密码修改成功' });
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
    app.post('/api/getcode2', getcode2);
    app.post('/api/postcode2', postcode2);

    // 启动定期清理任务
    console.log('用户模块已初始化...');
};

export { initializeUsers };