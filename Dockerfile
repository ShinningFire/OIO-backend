# 使用官方 Node.js 基础镜像 (Alpine 版本体积更小)
# 这里选择了 22 版本，以匹配较新的 Node.js 生态
FROM node:22-alpine

# 在容器内设置工作目录
WORKDIR /app

# 先拷贝 package 文件，利用 Docker 的层缓存机制
# 只要依赖没变，下次构建就不会重新执行 npm install，大幅加快流水线速度
COPY package*.json ./

# 仅安装生产环境依赖 (不安装 devDependencies 中的 nodemon 等)
RUN npm install --production

# 将当前目录下的所有代码（除了 .dockerignore 中排除的）复制到容器的 /app 目录下
COPY . .

# 声明容器将使用的端口。微信云托管默认使用 80 端口
EXPOSE 80

# 启动命令，对应你 package.json 中的 "start": "node main.js"
CMD ["npm", "start"]