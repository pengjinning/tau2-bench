# 环境搭建问题排查记录(macOS / 中国大陆网络环境)

本文档记录在本机(macOS, Apple Silicon)执行 `uv sync --extra voice` 时遇到的一系列问题及解决方案,供同样网络环境下的使用者参考。

---

## 问题总览

| # | 现象 | 根因 | 解决方式 |
| --- | ------ | ------ | ---------- |
| 1 | `pyaudio==0.2.14` 构建失败:`fatal error: 'portaudio.h' file not found` | 系统缺少 PortAudio C 库 | `brew install portaudio` |
| 2 | `brew install` 下载卡住 / SSL 报错 | 代理环境变量 scheme 写错(`socks://`),以及直连 GitHub blob 存储被重置 | 见下文 portable-ruby 断点续传方案 |
| 3 | `uv sync` 下载 wheel 超时(DNS / timeout) | 直连 `files.pythonhosted.org` 不稳定 | 使用清华 PyPI 镜像 |
| 4 | `tau2` CLI 导入即崩溃 `ValueError: Unknown scheme for proxy URL` | `HTTPS_PROXY=socks://...` 不是合法 scheme | 改为 `socks5h://` 或 unset |

---

## 1. pyaudio 构建失败:缺少 portaudio.h

`uv sync --extra voice` 需要从源码编译 `pyaudio`,编译时找不到 `portaudio.h`:

```text
src/pyaudio/device_api.c:9:10: fatal error: 'portaudio.h' file not found
hint: This error likely indicates that you need to install a library that
provides "portaudio.h" for `pyaudio@0.2.14`
```

解决:通过 Homebrew 安装 PortAudio:

```bash
brew install portaudio
```

安装后 pyaudio 即可正常编译(编译命令中会自动包含 `-I/opt/homebrew/include`)。

---

## 2. brew 安装失败:代理与 portable-ruby 下载问题

### 2.1 代理 scheme 错误

本机 shell 中导出了:

```bash
HTTP_PROXY=socks://127.0.0.1:10808
HTTPS_PROXY=socks://127.0.0.1:10808
```

问题:`socks://` 会被 curl 当作 **SOCKS4**,而本地 10808 端口是 **SOCKS5** 代理。
正确写法应为 `socks5://` 或 `socks5h://`(后者由代理端解析 DNS,推荐)。

### 2.2 portable-ruby 下载停滞

brew 每次运行前要把内部 Ruby 升级到 `portable-ruby 4.0.7_1`(本机只有 4.0.7),
该 12MB 压缩包托管在 `ghcr.io` → 重定向到 `pkg-containers.githubusercontent.com`,
直连下载反复在 30%~39% 处停滞或被重置(`curl: (35) SSL_ERROR_SYSCALL` / `rc=56`)。

### 2.3 解决:手动断点续传下载 portable-ruby

关键点:

1. ghcr.io 的 blob 接口需要 **Bearer token**(匿名即可获取);
2. 用 `curl -C -` 断点续传 + 重试循环,每次超时后从已下载位置继续;
3. 下载完成后校验 SHA-256,放入 brew 缓存目录,再由 brew 正常安装。

```bash
# 元信息(来自 brew 源码)
#   版本: cat /opt/homebrew/Library/Homebrew/vendor/portable-ruby-version  → 4.0.7_1
#   SHA : cat /opt/homebrew/Library/Homebrew/vendor/portable-ruby-arm64-darwin
#         → 25d6becc4464b6e65ac38a76ccd27eee8be5d0d805f6b3292d74e37deb8dd13b

URL="https://ghcr.io/v2/homebrew/core/portable-ruby/blobs/sha256:25d6becc4464b6e65ac38a76ccd27eee8be5d0d805f6b3292d74e37deb8dd13b"
DEST="$HOME/Library/Caches/Homebrew/portable-ruby-4.0.7_1.arm64_big_sur.bottle.tar.gz"

for i in $(seq 1 40); do
  # 每次重试都重新获取匿名 token(token 有有效期)
  TOKEN=$(curl -s --noproxy '*' --max-time 15 \
    "https://ghcr.io/token?scope=repository:homebrew/core/portable-ruby:pull&service=ghcr.io" \
    | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
  curl -s --fail --location --noproxy '*' -C - --max-time 90 \
    -H "Authorization: Bearer $TOKEN" "$URL" -o "${DEST}.incomplete"
  rc=$?
  echo "attempt $i: rc=$rc size=$(stat -f%z ${DEST}.incomplete 2>/dev/null || echo 0)"
  if [ $rc -eq 0 ]; then mv "${DEST}.incomplete" "$DEST"; echo COMPLETE; break; fi
  [ $rc -eq 33 ] && rm -f "${DEST}.incomplete"   # 33 = 服务器不支持续传,重新开始
  sleep 1
done

# 校验 SHA-256(应输出 25d6becc...)
shasum -a 256 "$DEST"

# 交给 brew 正常安装(会识别缓存文件)
brew vendor-install ruby
```

之后 `brew install portaudio` 即可成功(portaudio 本体很小,34 个文件 / 521KB)。

> 注:国内常见的 homebrew-bottles 镜像(清华 / 中科大 / 阿里)不收录 portable-ruby,
> ghcr 镜像(如 ghcr.nju.edu.cn)也返回 404,因此只能从官方源断点续传。

---

## 3. uv sync 下载超时:改用清华 PyPI 镜像

portaudio 装好后,`uv sync --extra voice` 编译 pyaudio 成功,但下载 wheel 时
对 `files.pythonhosted.org` 直连反复出现 DNS 失败 / 下载超时。

解决:指定清华 PyPI 镜像并加大超时(锁文件固定了 hash,镜像只是分发同样的 wheel,
不会影响依赖解析结果):

```bash
env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy -u ALL_PROXY -u all_proxy \
  UV_FROZEN=1 \
  UV_DEFAULT_INDEX="https://pypi.tuna.tsinghua.edu.cn/simple" \
  UV_HTTP_TIMEOUT=300 \
  uv sync --extra voice
```

验证:

```bash
uv run python -c "import pyaudio; print(pyaudio.__version__)"   # 0.2.14
uv run python -c "import sounddevice"                            # OK
uv run tau2 check-data                                           # 数据目录检查通过
```

---

## 4. tau2 CLI 启动崩溃:代理 scheme 不合法

环境变量中的 `socks://` scheme 会导致 `tau2` 在导入阶段直接崩溃(httpx 不接受
裸 `socks://`,只支持 `socks5://`):

```text
ValueError: Unknown scheme for proxy URL URL('socks://127.0.0.1:10808')
```

这不是 tau2 的 bug。临时绕过:

```bash
env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy uv run tau2 --help
```

---

## 5. 推荐的长期配置

在 `~/.zshrc`(或对应 shell 配置)中修正代理 scheme:

```bash
# 合法 scheme 为 socks5:// 或 socks5h://(不要写 socks://)
export HTTPS_PROXY=socks5h://127.0.0.1:10808
export HTTP_PROXY=socks5h://127.0.0.1:10808
export NO_PROXY=localhost,127.0.0.1,::1
```

今后在本网络环境下同步依赖时,建议始终带上镜像参数:

```bash
UV_FROZEN=1 UV_DEFAULT_INDEX=https://pypi.tuna.tsinghua.edu.cn/simple uv sync --extra voice
```

> 提醒:仓库约定 `UV_FROZEN=1`(见 AGENTS.md),避免 `uv run` 在本地包镜像环境下改写 `uv.lock`。

---

## 结论

最终 `uv sync --extra voice` 成功完成:

- `pyaudio==0.2.14` 编译通过(依赖 brew 安装的 portaudio 19.7.0);
- 全部依赖(含 livekit、elevenlabs、sounddevice 等 voice 组件)安装成功;
- `tau2 check-data` 验证通过,可以正常运行 tau2 命令。
