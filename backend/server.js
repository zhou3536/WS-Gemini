// server.js
import dotenv from 'dotenv';
dotenv.config();

// 引入密码认证模块
import { initializeAuth } from './auth.js';

// 将所有 CommonJS 的 require 转换为 ES Module 的 import
import express from "express";
import http from "http";
import { Server } from "socket.io";
import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";
import path from "path";

// 在 ES Module 中，__dirname 和 __filename 不再是全局变量，需要手动获取
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const host = process.env.HOST || '127.0.0.1';
const port = process.env.PORT || 3000;
const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
    console.error("错误：请在 .env 文件中设置您的 GEMINI_API_KEY");
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(API_KEY);
const historiesDir = path.join(__dirname, "histories"); // __dirname 现在已定义
if (!fs.existsSync(historiesDir)) {
    fs.mkdirSync(historiesDir);
}

app.use(express.json());
initializeAuth(app, process.env.accessPassword, process.env.cookieSecret);
app.use(express.static(path.join(__dirname, "public"))); // __dirname 现在已定义

io.on("connection", (socket) => {
    // console.log("客户端已连接");
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


    socket.on("disconnect", () => {
        // console.log("客户端已断开");
    });
});

async function handleNewMessage(socket, data) {
    // 将收到的用户消息立即回显给发送方
    socket.emit("userMessageEcho", { prompt: data.prompt, files: data.files });

    let { sessionId, prompt, files, model, useWebSearch } = data;
    // 1. 会话和历史记录管理
    if (!sessionId) {
        sessionId = `${Date.now()}.json`;
        socket.emit("sessionCreated", { sessionId });
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
            socket.emit("streamChunk", { chunk: chunkText });
        }

        // 4. 保存历史记录
        history.push(userMessage);
        history.push({ role: "model", parts: [{ text: fullResponse }] });
        fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));

        socket.emit("streamEnd");

        // 在新消息处理完成后，将更新的历史记录列表发送回客户端
        await listHistories(socket);


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

        socket.emit("error", {
            message: clientMessage,
            statusCode: statusCode
        });
    }
}

async function handleLoadHistory(socket, sessionId) {
    const historyPath = path.join(historiesDir, sessionId);
    if (fs.existsSync(historyPath)) {
        const history = fs.readFileSync(historyPath, "utf-8");
        socket.emit("historyLoaded", { history: JSON.parse(history) });
    } else {
        // 如果找不到历史文件，可能需要通知前端
        socket.emit("error", { message: "找不到指定的会话历史。" });
    }
}

async function getHistoriesList() {
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
        return historyList;
    } catch (error) {
        console.error("获取历史记录列表失败:", error);
        return [];
    }
}


async function listHistories(socket) {
    const historyList = await getHistoriesList();
    socket.emit('historiesListed', { list: historyList });
}

async function handleDeleteHistory(socket, sessionId) {
    const historyPath = path.join(historiesDir, sessionId);
    if (fs.existsSync(historyPath)) {
        fs.unlinkSync(historyPath);
        // After deleting, get the new list and send it back to the client.
        await listHistories(socket);
    } else {
        socket.emit("error", { message: "找不到要删除的会话历史。" });
    }
}

server.listen(port, host, () => {
    ""
    console.log(`服务器正在 http://${host}:${port} 上运行`);
});
