# AI Music Player

一个可以发布到 GitHub Pages 的静态音乐播放器。它会展示歌单，点击歌曲即可播放，并读取 `.lrc` 字幕自动滚动。没有 LRC 时，也兼容 `.txt` 字幕。

## 项目结构

```text
.
├── index.html
├── style.css
├── app.js
├── music-manifest.js
├── Left-Hand Side Answers/
│   ├── Left-Hand Side Answers.mp3
│   └── Left-Hand Side Answers.lrc
└── 左尾对白/
    ├── 左尾对白.mp3
    └── 左尾对白.lrc
```

## 怎么使用

最简单的方式是运行本地服务：

```bash
npm start
```

然后打开：

```text
http://localhost:3000
```

也可以直接打开 `index.html`，但有些浏览器会限制本地文件读取字幕，所以更推荐 `npm start`。

播放时可以拖动进度条跳转。字幕区域也可以用鼠标滚轮、触控板或手指上下滑动查看后面的歌词；停止滑动几秒后会自动回到当前播放位置。

如果字幕整体比歌曲快或慢，可以用页面里的「字幕提前」「字幕延后」按钮微调，每次调整 0.5 秒。

## 添加新歌

1. 为新歌新建一个文件夹。
2. 把新的 `.mp3` 和对应的 `.lrc` 放进这个文件夹，推荐文件夹、歌曲、LRC 使用同名。
3. 打开 `music-manifest.js`，添加歌曲：

```js
{
  id: "my-new-song",
  title: "My New Song",
  artist: "AI Music",
  src: "My%20New%20Song/My%20New%20Song.mp3",
  captions: "My%20New%20Song/My%20New%20Song.lrc"
}
```

注意：

- `id` 要唯一，建议只用英文、数字和连字符。
- `src` 里的空格要写成 `%20`。
- 中文文件名需要 URL 编码，例如 `左尾对白.mp3` 写成 `%E5%B7%A6%E5%B0%BE%E5%AF%B9%E7%99%BD.mp3`。
- `src` 和 `captions` 都要写完整的相对路径。

## LRC 字幕格式

推荐使用 LRC，因为它自带每句歌词的时间：

```text
[ti:歌曲标题]
[ar:歌手]
[offset:0]

[00:07.00]第一句歌词
[00:13.24]第二句歌词
[00:18.38]第三句歌词
```

播放器支持：

- 标准时间标签 `[mm:ss.xx]`
- 多时间标签同一句歌词
- `[offset:毫秒]` 整体偏移
- `[ti:]`、`[ar:]`、`[al:]` 等元信息标签

## TXT 字幕格式

如果没有 LRC，也可以使用带时间的 TXT：

```text
[00:00.00]第一句歌词
[00:08.50]第二句歌词
[00:16.00]第三句歌词
```

时间格式是：

```text
[分钟:秒.毫秒]
```

也可以写纯文本，每行一句：

```text
第一句歌词
第二句歌词
第三句歌词
```

纯文本没有准确时间，播放器会根据歌曲总时长大致均分每一句。想要字幕和音乐精确对齐，建议使用 LRC。

## 发布到 GitHub Pages

这个项目不依赖后端，适合直接发布到 GitHub Pages：

1. 把整个项目上传到 GitHub 仓库。
2. 进入仓库 `Settings`。
3. 找到 `Pages`。
4. Source 选择主分支和根目录。
5. 保存后，GitHub 会给你一个公开网址。

发布后，只要仓库里有新的 `.mp3`、`.lrc`，并且 `music-manifest.js` 已更新，网页就会显示新歌。

## 关于自动识别字幕

当前版本不需要 OpenAI API，也不会自动识别歌曲声音。字幕由你自己写成 `.txt` 文件，这样最适合 GitHub Pages。

如果以后你想恢复自动识别字幕，可以重新接入后端接口，例如 `server.js` 里的 `/api/transcribe`，但 GitHub Pages 本身不能运行后端代码。
