#!/bin/bash

# 检查参数
if [ $# -ne 2 ]; then
    echo "Usage: $0 <x> <y>"
    exit 1
fi

X=$1
Y=$2

# 临时文件路径
TEMP_IMAGE="/tmp/screenshot.png"

# 捕获屏幕截图
screencapture -x "$TEMP_IMAGE"

# 检查截图是否成功
if [ ! -f "$TEMP_IMAGE" ]; then
    echo "#------"
    exit 1
fi

# 使用ImageMagick获取指定位置的颜色
# 格式: convert <image> -format "%[pixel:p{X,Y}]" info:
COLOR=$(convert "$TEMP_IMAGE" -format "%[pixel:p{$X,$Y}]" info: 2>/dev/null)

# 检查命令是否成功
if [ $? -ne 0 ]; then
    echo "#------"
    # 清理临时文件
    rm -f "$TEMP_IMAGE"
    exit 1
fi

# 转换颜色格式为HEX
# 格式: rgb(255,255,255) -> #FFFFFF
HEX=$(echo "$COLOR" | sed 's/rgb(\([0-9]*\),\([0-9]*\),\([0-9]*\))/printf #%02X%02X%02X \\1 \\2 \\3/e')

# 输出颜色值
echo "$HEX"

# 清理临时文件
rm -f "$TEMP_IMAGE"
