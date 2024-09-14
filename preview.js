const express = require('express');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const cron = require('node-cron');

// 加载 .env 文件中的配置
if (fs.existsSync('.env.local')) {
    dotenv.config({ path: '.env.local' });
} else {
    dotenv.config();
}

// 读取 WebDAV 配置信息
const WEBDAV_URL = process.env.WEBDAV_URL;
const WEBDAV_USERNAME = process.env.WEBDAV_USERNAME;
const WEBDAV_PASSWORD = process.env.WEBDAV_PASSWORD;

// 动态导入 webdav 模块
async function getWebdavClient() {
    const { createClient } = await import('webdav');
    return createClient(
        WEBDAV_URL, // WebDAV服务的URL
        {
            username: WEBDAV_USERNAME, // WebDAV用户名
            password: WEBDAV_PASSWORD, // WebDAV密码
        }
    );
}

// 创建 Express 应用
const app = express();
const port = 8888; // 你可以根据需要修改端口

let webdavClient;
let imageFilesCache = []; // 缓存图片列表
let isRefreshing = false; // 标记是否正在刷新

// 初始化 WebDAV 客户端
async function initializeWebdavClient() {
    try {
        webdavClient = await getWebdavClient();
        console.log('WebDAV 客户端已初始化');
    } catch (error) {
        console.error('初始化 WebDAV 客户端时出错:', error);
    }
}

// 获取 WebDAV 目录下的所有图片文件并缓存
async function refreshImageList() {
    if (isRefreshing) {
        console.log('图片列表正在刷新中，跳过此次刷新');
        return;
    }

    isRefreshing = true;
    console.log('开始刷新图片列表...');

    try {
        const directoryItems = await webdavClient.getDirectoryContents('/tuapi/');
        // 过滤出图片文件（假设图片文件是 .jpg, .png 等常见格式）
        const newImageFiles = directoryItems.filter(item =>
            item.type === 'file' && (item.basename.endsWith('.jpg') || item.basename.endsWith('.png') || item.basename.endsWith('.webp'))
        );
        imageFilesCache = newImageFiles;
        console.log(`图片列表已刷新，当前图片数量: ${imageFilesCache.length}`);
    } catch (error) {
        console.error('刷新图片列表时出错:', error);
    } finally {
        isRefreshing = false;
    }
}

// 随机选择一张图片
function getRandomImage() {
    if (imageFilesCache.length === 0) {
        return null;
    }
    const randomIndex = Math.floor(Math.random() * imageFilesCache.length);
    return imageFilesCache[randomIndex];
}

// 创建随机图片接口
app.get('/random-image', async (req, res) => {
    try {
        // 检查缓存是否为空
        if (imageFilesCache.length === 0) {
            await refreshImageList();
        }

        // 随机选择一张图片
        const randomImage = getRandomImage();

        if (randomImage) {
            // 通过 WebDAV 客户端获取图片内容
            const imageData = await webdavClient.getFileContents(`/tuapi/${randomImage.basename}`, {
                format: 'binary',
            });

            // 设置适当的响应头返回图片
            res.set('Content-Type', `image/${path.extname(randomImage.basename).slice(1)}`);
            res.send(imageData);
        } else {
            res.status(404).send('No images found');
        }
    } catch (error) {
        console.error('获取随机图片时出错:', error);
        res.status(500).send('服务器内部错误');
    }
});

// 启动服务器前初始化并刷新图片列表
(async () => {
    await initializeWebdavClient();
    await refreshImageList();

    // 设置定时任务，每小时刷新一次图片列表
    cron.schedule('0 * * * *', () => {
        console.log('定时任务触发，刷新图片列表');
        refreshImageList();
    });

    // 启动服务器
    app.listen(port, () => {
        console.log(`随机图片服务正在运行，访问：http://localhost:${port}/random-image`);
    });
})();