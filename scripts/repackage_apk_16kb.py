import zipfile, os

# 用内存读写方式重打包 APK：逐条复制原包所有条目，仅替换 arm64 的 .so 为 16KB 页对齐版本。
# 关键点：绝不解压到磁盘再用 os.walk 重打包——AAPT2 的短名资源在 NTFS 上会丢失，导致资源引用悬空、App 启动即崩。
# 改为 zin.infolist() 直接逐条读取并写入，保留全部 922 个条目（含 META-INF 依赖元数据）。

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "src-tauri", "gen", "android", "app", "build", "outputs", "apk", "universal", "release", "app-universal-release-unsigned.apk")
SO  = os.path.join(ROOT, "src-tauri", "target", "aarch64-linux-android", "release", "libeasywork_lib.so")
OUT = os.path.join(ROOT, "_tmp_unaligned16.apk")

SO_ENTRY = "lib/arm64-v8a/libeasywork_lib.so"

if not os.path.exists(SRC):
    raise SystemExit(f"源 APK 不存在: {SRC}")
if not os.path.exists(SO):
    raise SystemExit(f"16KB .so 不存在: {SO}")

with open(SO, "rb") as f:
    so_data = f.read()
print(f"16KB .so 大小: {len(so_data)} bytes")

with zipfile.ZipFile(SRC) as zin:
    infos = zin.infolist()
    total = len(infos)
    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as zout:
        written = 0
        for info in infos:
            if info.filename == SO_ENTRY:
                # 跳过原 .so，稍后用 16KB 版本替换（必须 STORED 且页对齐）
                continue
            data = zin.read(info.filename)
            # 保留原条目的压缩方式与元数据（含 META-INF 依赖元数据）
            zout.writestr(info, data, info.compress_type)
            written += 1
        # 写入 16KB 页对齐的 .so（STORED 未压缩，供 zipalign -P 16 页对齐）
        so_info = zipfile.ZipInfo(SO_ENTRY)
        so_info.compress_type = zipfile.ZIP_STORED
        so_info.date_time = (1980, 1, 1, 0, 0, 0)
        zout.writestr(so_info, so_data, zipfile.ZIP_STORED)
        written += 1
    print(f"重打包完成: 原 {total} 条目 -> 写出 {written} 条目 (应相等)")
