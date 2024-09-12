const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const fs = require('fs');
const path = require('path');
const https = require('https');
const dotenv = require('dotenv');

if (fs.existsSync('.env.local')) {
    dotenv.config({ path: '.env.local' });
} else {
    dotenv.config();
}

const WEBDAV_URL = process.env.WEBDAV_URL;
const WEBDAV_USERNAME = process.env.WEBDAV_USERNAME;
const WEBDAV_PASSWORD = process.env.WEBDAV_PASSWORD;

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function getWebdavClient() {
    const { createClient } = await import('webdav');
    return createClient(
        WEBDAV_URL,
        {
            username: WEBDAV_USERNAME,
            password: WEBDAV_PASSWORD,
        }
    );
}

let proxies = [];
let currentProxyIndex = 0;

async function fetchProxyIpList() {
    try {
        const response = await axios.get('https://api.openproxylist.xyz/http.txt');
        if (response.data) {
            return response.data.split('\n').map(ip => ip.trim()).filter(ip => ip);
        }
    } catch (error) {
        console.error('获取代理IP列表时出错:', error);
    }
    return [];
}

async function updateProxyPool() {
    const proxyList = await fetchProxyIpList();
    if (proxyList.length > 0) {
        proxies = proxyList;
        console.log(`代理IP池已更新: ${proxyList.join(', ')}`);
    } else {
        console.log('没有获取到新的代理IP');
    }
}

function getNextProxy() {
    if (proxies.length === 0) {
        throw new Error('代理池为空');
    }

    if (currentProxyIndex >= proxies.length) {
        currentProxyIndex = 0;
    }

    const proxy = proxies[currentProxyIndex];
    currentProxyIndex = (currentProxyIndex + 1) % proxies.length;
    return proxy;
}

function removeCurrentProxy() {
    if (proxies.length === 0) {
        console.error('代理池为空，无法移除代理');
        return;
    }

    const removedProxy = proxies.splice(currentProxyIndex, 1)[0];

    // console.log(`已移除无效代理: ${removedProxy}`);

    if (currentProxyIndex >= proxies.length) {
        currentProxyIndex = 0;
    }
}

async function fetchImageUrl() {
    try {
        const proxyUrl = getNextProxy();
        console.log(`正在使用代理: ${proxyUrl}`);

        const agent = new HttpsProxyAgent(`http://${proxyUrl}`);

        console.log('即将发送请求至 https://tuapi.eees.cc/api.php?category=dongman&type=302');

        const response = await axios.get('https://tuapi.eees.cc/api.php?category=dongman&type=302', {
            maxRedirects: 0,
            validateStatus: function (status) {
                return status >= 200 && status < 400;
            },
            httpAgent: agent,
            httpsAgent
        });

        const imageUrl = response.headers['location'];
        console.log(`获取的图片URL: ${imageUrl}`);
        return imageUrl;
    } catch (error) {
        console.error('获取图片URL时出错:', error.message);
        console.error('错误响应数据:', error.response ? error.response.data : '无响应数据');
        removeCurrentProxy();
        return null;
    }
}

async function startContinuousScraping() {
    await updateProxyPool();

    while (true) {
        const imageUrl = await fetchImageUrl();
        if (imageUrl) {
            const filename = path.basename(imageUrl);
            await downloadAndUploadImage(imageUrl, filename);
        }
        await delay(5000);
    }
}

startContinuousScraping();

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function downloadAndUploadImage(imageUrl, filename) {
    try {
        const webdavClient = await getWebdavClient();

        try {
            await webdavClient.stat(`/tuapi/${filename}`);
            console.log(`文件 ${filename} 已存在，跳过上传。`);
            return;
        } catch (err) {
            console.log(`文件 ${filename} 不存在，准备下载并上传。`);
        }

        const response = await axios({
            url: imageUrl,
            method: 'GET',
            responseType: 'stream',
            httpsAgent
        });

        const tempFilePath = path.join(__dirname, filename);
        const writer = fs.createWriteStream(tempFilePath);
        response.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        const fileContent = fs.readFileSync(tempFilePath);
        await webdavClient.putFileContents(`/tuapi/${filename}`, fileContent);
        fs.unlinkSync(tempFilePath);

        console.log(`图片 ${filename} 已成功上传到 WebDAV！`);
    } catch (error) {
        console.error('下载或上传图片时出错:', error);
    }
}
