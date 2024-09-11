## 爬取`tuapi.eees.cc`所有图片到自己的云盘

## 1. 注册一个云盘
[注册地址](https://infini-cloud.net/en/)  
注册完成后开启[Webdav](https://infini-cloud.net/en/modules/mypage/usage/)  
填写邀请码多获取5G容量：`GU9N4`  
开启后会给你
`WebDAV Connection URL`
`Connection ID`
`Apps Password`
记录下填入到`.env`文件
```
WEBDAV_URL = WebDAV Connection URL
WEBDAV_USERNAME = Connection ID
WEBDAV_PASSWORD = Apps Password
```
## 2. 安装依赖
```
# node version > 18+
npm i
```
## 3. 运行
```
node index.js
```

## 本地预览运行
```
node preview.js
```