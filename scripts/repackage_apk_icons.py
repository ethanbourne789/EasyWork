import zipfile, os, shutil

# 把库里的 Android 自适应图标(icons/android)注入已构建好的 APK。
# 关键: 全程内存读写 zip, 逐条复制原包所有条目, 只覆盖图标文件 —— 绝不解压到磁盘再 os.walk 重打包。
# 原因: AAPT2 把资源文件名压成短名(如 res/gR.xml), Windows NTFS 大小写不敏感 + 文件数多,
#       用 extractall+os.walk 重打包会丢失部分资源文件, 导致 resources.arsc 引用悬空 -> App 启动即崩。

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "src-tauri", "gen", "android", "app", "build", "outputs", "apk", "universal", "release", "app-universal-release-unsigned.apk")
ICON_SRC = os.path.join(ROOT, "icons", "android")
OUT = os.path.join(ROOT, "_tmp_unaligned_icons.apk")

# 需要覆盖的图标资源(相对 res/)
ICON_FILES = []
for d in ["hdpi", "mdpi", "xhdpi", "xxhdpi", "xxxhdpi"]:
    dp = os.path.join(ICON_SRC, f"mipmap-{d}")
    if os.path.isdir(dp):
        for fn in os.listdir(dp):
            ICON_FILES.append((os.path.join(dp, fn), f"res/mipmap-{d}/{fn}"))
# 自适应图标 + 背景
anydpi = os.path.join(ICON_SRC, "mipmap-anydpi-v26", "ic_launcher.xml")
if os.path.exists(anydpi):
    ICON_FILES.append((anydpi, "res/mipmap-anydpi-v26/ic_launcher.xml"))
bg = os.path.join(ICON_SRC, "values", "ic_launcher_background.xml")
if os.path.exists(bg):
    ICON_FILES.append((bg, "res/values/ic_launcher_background.xml"))

icon_map = {arc: path for path, arc in ICON_FILES}

with zipfile.ZipFile(SRC) as zin:
    infos = zin.infolist()
    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as zout:
        for info in infos:
            if info.filename in icon_map:
                data = open(icon_map[info.filename], "rb").read()
                # 图标 png/xml 用原压缩方式写入
                zout.writestr(info, data, info.compress_type)
            else:
                zout.writestr(info, zin.read(info.filename), info.compress_type)
print(f"图标注入完成 -> {OUT} (覆盖 {len(icon_map)} 个图标条目)")
