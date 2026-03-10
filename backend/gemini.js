import dotenv from 'dotenv';
dotenv.config();
import { GoogleGenAI } from "@google/genai";
import fs from "fs";
import path from "path";
import { readFile, writeFile, readdir, unlink, access, mkdir } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CUSTOM_BASE_URL = process.env.PROXYURL;
const KEY2 = process.env.KEY2;

if (CUSTOM_BASE_URL) {
    console.log('代理地址:', CUSTOM_BASE_URL);
} else {
    console.log('代理地址：直连');
}
const historiesDir = path.join(__dirname, "histories");
if (!fs.existsSync(historiesDir)) { fs.mkdirSync(historiesDir); }

let users = [];
let io = null;
const activechat = new Map();
export function initializeGemini(usersArray, ioInstance) {
    users = usersArray;
    io = ioInstance;
    io.on("connection", (socket) => {
        const loginId = socket.request.signedCookies?.session_id?.userId;
        const loginToken = socket.request.signedCookies?.session_id?.sessionToken;
        const loginuser = users.find(user => user.userId === loginId && user.sessionToken === loginToken)
        if (loginuser) {
            socket.user = loginuser;
            socket.userId = loginId;
            socket.HistoriesList =  await getHistoriesList(socket);
            activechat.set(socket.id, socket.userId);
            if (loginuser.API_KEY) {
                socket.userApiKey = loginuser.API_KEY;
                socket.userApiKeyCipher = '*'.repeat(30) + socket.userApiKey.slice(30);
                socket.emit("APIKEY", socket.userApiKeyCipher)
            } else {
                socket.emit("tongzhi", "账户没有配置API_KEY，请配置API_KEY");
            }
        } else {
            console.log("Socket.IO 客户端连接成功，但未找到用户 ID 或未认证，跳转登录页面");
            socket.emit('refresh', '/signup.html');
            socket.disconnect();
            return;
        }
        console.log(`Socket.IO用户连接:${loginuser.username}`);
        listHistories(socket);

        socket.on("newMessage", async (data) => {
            await handleNewMessage(socket, data);
        });

        socket.on("loadHistory", async (data) => {
            await handleLoadHistory(socket, data.sessionId);
        });

        socket.on("deleteHistory", async (data) => {
            await handleDeleteHistory(socket, data.sessionId);
        });
        socket.on("sendapikey", async (data) => {
            await setapikey(socket, data);
        });
        socket.on("SimpleMessage", async (data) => {
            await Simplemessage(socket, data);
        });
        socket.on("disconnect", () => {
            activechat.delete(socket.id);
        });
    });
};
//简单接口
async function Simplemessage(socket, data) {
    if (!data) return;

    try {
        const ai = new GoogleGenAI({
            apiKey: socket.userApiKey,
            httpOptions: { baseUrl: CUSTOM_BASE_URL }
        });

        const responseStream = await ai.models.generateContentStream({
            model: 'gemini-2.5-flash-lite',
            contents: [{ role: 'user', parts: [{ text: data }] }],
            config: {}
        });

        let fullResponse = "";

        for await (const chunk of responseStream) {
            const chunkText = chunk.text;
            if (chunkText) {
                fullResponse += chunkText;
                socket.emit("streamChunk", { chunk: chunkText });
            }
        }

        socket.emit("streamEnd");

    } catch (error) {
        let errorMessage = error.message || "未知错误";
        console.error("AI Error:", error);
        socket.emit('tongzhi', `错误状态: ${error.status || 'Error'}，${errorMessage}`);
    }
}
async function shortmessage(socket, historydata) {
    if (!historydata) return;

    try {
        // const ai = new GoogleGenAI({
        //     apiKey: KEY2,
        //     httpOptions: { baseUrl: CUSTOM_BASE_URL }
        // });

        // const chat = ai.chats.create({
        //     model: "gemini-2.5-flash-lite",
        //     history: historydata,
        // });

        // const response1 = await chat.sendMessage({
        //     message: "根据上面的对话生成标题。要求：越短越好，只返回标题，不要解释，不要引号，不要任何额外文字，标题不超过20个字",
        //     config: { temperature: 0.2, maxOutputTokens: 20 }
        // });
        // console.log('ai创建标题成功')
        // return response1.text;
        return Date.now();
    } catch (error) {
        console.log('ai创建标题失败', `错误状态: ${error.status}`)
        return '';
    }
}

//添加和验证API_KEY
async function setapikey(socket, data) {
    if (!data) { return; }
    try {
        const ai = new GoogleGenAI({
            apiKey: data.trim(),
            httpOptions: { baseUrl: CUSTOM_BASE_URL }
        });
        const responseStream = await ai.models.generateContentStream({
            model: 'gemini-2.5-flash-lite',
            contents: "Hello",
            config: {}
        });
    } catch (error) {
        let errorMessage = "API_KEY无效，未知错误";
        if (error.status === 400) {
            errorMessage = 'API_KEY格式不正确';
        } else if (error.status === 401) {
            errorMessage = 'API_KEY无效、过期、被禁用';
        } else if (error.status === 403) {
            errorMessage = 'API_KEY没有权限或超出免费层级';
        } else if (error.message) {
            errorMessage = `API_KEY无效，${error.message}`;
        };

        if (error.status) {
            socket.emit('tongzhi', `${errorMessage}，错误代码${error.status}`);
        } else {
            socket.emit('tongzhi', '网络连接错误，无法连接到API地址');
        };

        return;
    }
    // API key 验证通过
    const user = users.find(user => user.userId === socket.userId);
    if (user) {
        user.API_KEY = data.trim();
    } else {
        socket.emit('tongzhi', '设置失败');
        return;
    }
    try {
        await writeFile('./users.json', JSON.stringify(users, null, 2), 'utf-8');
        socket.userApiKey = data.trim();
        socket.userApiKeyCipher = '*'.repeat(30) + socket.userApiKey.slice(30);
        socket.emit('tongzhi', 'API_KEY验证成功')
        socket.emit("APIKEY", socket.userApiKeyCipher)
        console.log(socket.user.username, "用户更新API_KEY：", socket.userApiKeyCipher);
    } catch (writeError) {
        console.error(`写入 users.json 失败 (用户: ${socket.userId}):`, writeError);
        socket.emit('tongzhi', 'API_KEY保存失败');
    }
}

async function handleNewMessage(socket, data) {
    const userId = socket.userId;
    const userApiKey = socket.userApiKey;
    const fileCount = data.files ? data.files.length : 0;
    socket.emit("userMessageEcho", { prompt: data.prompt, fileCount });
    if (!userId || !userApiKey) {
        socket.emit("APIerror", { message: "未登录或未配置API_KEY" });
        return;
    }
    const ai = new GoogleGenAI({
        apiKey: userApiKey,
        httpOptions: { baseUrl: CUSTOM_BASE_URL }
    });
    let { sessionId, prompt, files, model, useWebSearch, defaultModelConfig } = data;
    let isNewSession = false;
    console.log(defaultModelConfig);
    const userHistoriesDir = path.join(historiesDir, userId);
    if (!sessionId) {
        isNewSession = true;
        sessionId = `${Date.now()}.json`;
    }
    const historyPath = path.join(userHistoriesDir, sessionId);
    try {
        await access(userHistoriesDir);
    } catch (error) {
        if (error.code === 'ENOENT') {
            await mkdir(userHistoriesDir);
        } else {
            console.error(`创建用户历史目录失败 ${userHistoriesDir} (用户: ${userId}):`, error);
            socket.emit('historyerror', { message: '无法创建会话目录，请稍后再试。' });
            return;
        }
    }

    let history = [];
    if (!isNewSession) {
        try {
            const historyData = await readFile(historyPath, "utf-8");
            history = JSON.parse(historyData);
        } catch (error) {
            console.error(`加载或解析历史记录失败 ${historyPath} (用户: ${userId}):`, error);
            socket.emit("APIerror", { message: `无法加载会话历史 (${sessionId})，文件可能已损坏。请尝试新的会话。` });
            return;
        }
    }

    const userMessage = { role: "user", parts: [{ text: prompt }] };
    if (files && files.length > 0) {
        const fileParts = files.map(file => ({
            inlineData: {
                data: file.data,
                mimeType: file.mimeType,
            },
        }));
        userMessage.parts.push(...fileParts);
    }

    // 调用Gemini API
    try {
        console.log('User ID:', userId, ' Model:', model, ' Websearch:', useWebSearch,);

        let config = defaultModelConfig || {};

        if (useWebSearch) {
            config.tools = [{ googleSearch: {} }];
        }
        console.log(config);
        const chat = ai.chats.create({
            model: model,
            history: history,
            config
        });
        // const responseStream = await chat.sendMessageStream({
        //     message: userMessage
        // });
        // 测试消息
        const responseStream = {
            async *[Symbol.asyncIterator]() {
                const texts = [
                    "你好，",
                    "这是",
                    "一条",
                    "测试消息。"
                ];

                for (const t of texts) {
                    await new Promise(r => setTimeout(r, 200)); // 模拟流式延迟
                    yield { text: t };
                }
            }
        };
        let fullResponse = "";
        for await (const chunk of responseStream) {
            const chunkText = chunk.text || "";
            if (chunkText) {
                fullResponse += chunkText;
                socket.emit("streamChunk", { chunk: chunkText });
            }
        }
        socket.emit("streamEnd");
        if (isNewSession) {
            socket.emit("sessionCreated", { sessionId });




            if (prompt.length > 0 || files.length > 0) {
                const historytext = [];
                historytext.push(userMessage);
                historytext.push({ role: "model", parts: [{ text: fullResponse }] });
                const res = await shortmessage(socket, historytext);
                // if (res) userMessage.parts[0].title = res;
                socket.HistoriesList.push({
                    sessionId,
                    title:res
                })
                console.log(socket.HistoriesList)
                const HistoriesList = path.join(userHistoriesDir, 'HistoriesList.json');
                await writeFile(HistoriesList, JSON.stringify(socket.HistoriesList, null, 2), 'utf-8');
            }
        }

        // 保存历史记录
        history.push(userMessage);
        history.push({ role: "model", parts: [{ text: fullResponse }] });
        await writeFile(historyPath, JSON.stringify(history, null, 2), 'utf-8');


        await listHistories(socket);

    } catch (error) {
        console.error("Gemini API 调用失败:", error);

        let clientMessage = "与Gemini的通信出现问题。";
        let statusCode = null;

        if (error.message) {
            clientMessage = error.message;
        }

        if (error.status) {
            statusCode = error.status;
        } else if (error.response && error.response.status) {
            statusCode = error.response.status;
        } else if (error.code) {
            statusCode = error.code;
        }

        if (statusCode) {
            clientMessage += ` (错误代码: ${statusCode})`;
        }

        socket.emit("APIerror", {
            message: clientMessage,
            statusCode: statusCode
        });
    }
}

async function handleLoadHistory(socket, sessionId) {
    const userId = socket.userId;
    if (!userId) {
        console.error('未认证用户尝试加载历史。');
        socket.emit("historyerror", { message: "未认证，无法加载历史。" });
        return;
    }
    const userHistoriesDir = path.join(historiesDir, userId);
    const historyPath = path.join(userHistoriesDir, sessionId);
    try {
        await access(historyPath);
        const historyData = await readFile(historyPath, "utf-8");
        const history = JSON.parse(historyData);
        socket.emit("historyLoaded", { history: history });
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log(`尝试加载不存在的历史文件: ${historyPath}`);
            socket.emit("historyerror", { message: "找不到指定的会话历史, 请开始新的会话。" });
        } else {
            console.error(`加载或解析历史记录失败 ${historyPath} (用户: ${userId}):`, error);
            socket.emit("historyerror", { message: `无法加载会话历史 (${sessionId})，文件可能已损坏。` });
        }
        await listHistories(socket);
    }
}

async function getHistoriesList(socket) {
    // const userHistoriesDir = path.join(historiesDir, userId);

    const dir = path.join(__dirname, "histories", socket.userId);
    const file = path.join(dir, "historiesList.json");

    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    if (!fs.existsSync(file)) {
        fs.writeFileSync(file, "[]", "utf8");
    }

    let data;
    try {
        data = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
        data = [];
    }

    // 添加到全局变量
    socket.HistoriesList.push(...data);
    return socket.HistoriesList;






    // const files = await readdir(userHistoriesDir);
    // const jsonFiles = files.filter(file => file.endsWith('.json'));
    // const historyListPromises = jsonFiles.map(async (file) => {
    //     const filePath = path.join(userHistoriesDir, file);
    //     try {
    //         const content = await readFile(filePath, 'utf-8');
    //         const history = JSON.parse(content);

    //         const userMsg = history.find(item => item.role === "user");
    //         const title = userMsg?.parts?.[0]?.title
    //             || userMsg?.parts?.[0]?.text
    //             || "无标题";
    //         return { sessionId: file, title };
    //     } catch (error) {
    //         console.error(`处理历史文件失败 ${file} (用户: ${userId}):`, error);
    //         return { sessionId: file, title: '无效的历史记录' };
    //     }
    // });
    // const historyList = await Promise.all(historyListPromises);
    // historyList.sort((a, b) => {
    //     return parseInt(b.sessionId, 10) - parseInt(a.sessionId, 10);
    // });
    // return socket.HistoriesList;
    // } catch (error) {
    //     console.error("获取历史记录列表失败:", error);
    //     return [];
    // }
}

// async function listHistories(socket) {
//     const userId = socket.userId;
//     const historyList = await getHistoriesList(socket);
//     socket.emit('historiesListed', { list: historyList });
// }

async function handleDeleteHistory(socket, sessionId) {
    const userId = socket.userId;
    if (!userId) {
        console.error('未认证用户尝试删除历史。');
        socket.emit("error", { message: "未认证，无法删除历史。" });
        return;
    }
    const userHistoriesDir = path.join(historiesDir, userId);
    const historyPath = path.join(userHistoriesDir, sessionId);
    try {
        await unlink(historyPath);
        await listHistories(socket);
        console.log(`成功删除历史文件: ${historyPath}`);
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log(`尝试删除不存在的历史文件: ${historyPath}`);
            socket.emit("error", { message: "找不到要删除的会话历史。" });
        } else {
            console.error(`删除历史文件失败 ${historyPath} (用户: ${userId}):`, error);
            socket.emit("error", { message: "删除会话历史时发生错误。" });
        }
        await listHistories(socket);
    }
}
//强制下线
export function disconnectChat(userId) {
    for (const [socketId, uid] of activechat) {
        if (uid === userId) {
            const socket = io.sockets.sockets.get(socketId);
            if (socket) socket.disconnect(true);
            activechat.delete(socketId);
        }
    }
}
