require("dotenv").config();

// 引入密码认证模块
import { initializeAuth } from './auth.js';
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const host = process.env.HOST || '127.0.0.1';
const port = process.env.PORT || 3000;
const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
    console.error("错误：请在 .env 文件中设置您的 GEMINI_API_KEY");
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(API_KEY);
const historiesDir = path.join(__dirname, "histories");
if (!fs.existsSync(historiesDir)) {
    fs.mkdirSync(historiesDir);
}

initializeAuth(app, process.env.accessPassword, process.env.cookieSecret);

app.use(express.static(path.join(__dirname, "public")));

wss.on("connection", (ws) => {
    // console.log("客户端已连接");
    listHistories(ws);

    ws.on("message", async (message) => {
        const data = JSON.parse(message);

        switch (data.type) {
            case "newMessage":
                await handleNewMessage(ws, data);
                break;
            case "loadHistory":
                await handleLoadHistory(ws, data.sessionId);
                break;
            case "deleteHistory":
                await handleDeleteHistory(ws, data.sessionId);
                break;
        }
    });

    ws.on("close", () => {
        // console.log("客户端已断开");
    });
});

async function handleNewMessage(ws, data) {
    // 将收到的用户消息立即回显给发送方
    ws.send(JSON.stringify({ type: "userMessageEcho", prompt: data.prompt, files: data.files }));

    let { sessionId, prompt, files, model, useWebSearch } = data; // 确保 useWebSearch 被解构出来
    // 1. 会话和历史记录管理
    if (!sessionId) {
        sessionId = `${Date.now()}.json`;
        ws.send(JSON.stringify({ type: "sessionCreated", sessionId }));
        fs.writeFileSync(path.join(historiesDir, sessionId), JSON.stringify([]));
    }

    const historyPath = path.join(historiesDir, sessionId);
    let history = JSON.parse(fs.readFileSync(historyPath, "utf-8"));

    // 2. 构建请求
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

    // 3. 调用Gemini API
    try {
        console.log('ID:', sessionId, ' modal:', model, ' Web search:', useWebSearch);
        const generationConfig = {
            // temperature: 0.7, // 可以根据需要调整
        };

        // 构建模型参数对象
        const modelParams = {
            model,
            generationConfig,
        };

        // 根据 useWebSearch 条件添加 tools
        if (useWebSearch) {
            modelParams.tools = [{ google_search: {} }];
        }

        const geminiModel = genAI.getGenerativeModel(modelParams);

        const chat = geminiModel.startChat({
            history: history,
            generationConfig: {
                // maxOutputTokens: 100, // 根据需要调整
            },
        });

        const result = await chat.sendMessageStream(userMessage.parts);

        let fullResponse = "";
        for await (const chunk of result.stream) {
            const chunkText = chunk.text();
            fullResponse += chunkText;
            ws.send(JSON.stringify({ type: "streamChunk", chunk: chunkText }));
        }

        // 4. 保存历史记录
        history.push(userMessage);
        history.push({ role: "model", parts: [{ text: fullResponse }] });
        fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));

        ws.send(JSON.stringify({ type: "streamEnd" }));

        // 在新消息处理完成后，广播更新的历史记录列表
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                listHistories(client);
            }
        });

    } catch (error) {
        console.error("Gemini API 调用失败:", error);

        let clientMessage = "与Gemini的通信出现问题。"; // 默认的通用错误信息
        let statusCode = null;

        // 1. 尝试从 error.errorDetails 数组中提取最具体的 message
        if (error.errorDetails && Array.isArray(error.errorDetails)) {
            for (const detail of error.errorDetails) {
                if (detail.message) {
                    clientMessage = detail.message; // 找到第一个有 message 的就用它
                    break; // 找到后就跳出循环
                }
            }
        }
        if (clientMessage === "与Gemini的通信出现问题。" && error.message) {
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
            clientMessage += ` (代码: ${statusCode})`;
        }

        ws.send(JSON.stringify({
            type: "error",
            message: clientMessage,
            statusCode: statusCode
        }));
    }
}

async function handleLoadHistory(ws, sessionId) {
    const historyPath = path.join(historiesDir, sessionId);
    if (fs.existsSync(historyPath)) {
        const history = fs.readFileSync(historyPath, "utf-8");
        ws.send(JSON.stringify({ type: "historyLoaded", history: JSON.parse(history) }));
    } else {
        // 如果找不到历史文件，可能需要通知前端
        ws.send(JSON.stringify({ type: "error", message: "找不到指定的会话历史。" }));
    }
}

async function listHistories(ws) {
    try {
        const files = fs.readdirSync(historiesDir)
            .filter(file => file.endsWith('.json'))
            .sort((a, b) => b.split('.')[0] - a.split('.')[0]); // 按时间戳降序排序

        const historyList = files.map(file => {
            const filePath = path.join(historiesDir, file);
            const content = fs.readFileSync(filePath, 'utf-8');
            const history = JSON.parse(content);
            const firstUserMessage = history.find(msg => msg.role === 'user');
            const title = firstUserMessage ? firstUserMessage.parts[0].text.substring(0, 50) : '无标题'; // 截取前50个字符
            return { sessionId: file, title };
        });

        ws.send(JSON.stringify({ type: 'historiesListed', list: historyList }));
    } catch (error) {
        console.error("获取历史记录列表失败:", error);
        ws.send(JSON.stringify({ type: 'error', message: '无法加载历史记录列表。' }));
    }
}

async function handleDeleteHistory(ws, sessionId) {
    const historyPath = path.join(historiesDir, sessionId);
    if (fs.existsSync(historyPath)) {
        fs.unlinkSync(historyPath);
        // Broadcast updated history list to all clients
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                listHistories(client);
            }
        });
    } else {
        ws.send(JSON.stringify({ type: "error", message: "找不到要删除的会话历史。" }));
    }
}

server.listen(port, host, () => {
    ""
    console.log(`服务器正在 http://${host}:${port} 上运行`);
});
