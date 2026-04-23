#!/usr/bin/env osascript

-- 检查参数
on run argv
    if (count of argv) is not 2 then
        return "#------"
    end if
    
    set x to item 1 of argv as integer
    set y to item 2 of argv as integer
    
    -- 临时文件路径
    set tempImage to "/tmp/screenshot.png"
    
    -- 捕获屏幕截图
    do shell script "screencapture -x " & quoted form of tempImage
    
    -- 检查截图是否成功
    if not (do shell script "[ -f " & quoted form of tempImage & " ]; echo $?") as integer is 0 then
        return "#------"
    end if
    
    -- 使用sips命令获取指定位置的颜色
    -- 格式: sips -g pixelColor image.png -X x -Y y
    set colorOutput to do shell script "sips -g pixelColor " & quoted form of tempImage & " -X " & x & " -Y " & y
    
    -- 解析颜色输出
    -- 输出格式: pixelColor: (R G B A)
    set AppleScript's text item delimiters to " "
    set colorParts to text items of colorOutput
    set AppleScript's text item delimiters to ""
    
    if (count of colorParts) < 5 then
        -- 清理临时文件
        do shell script "rm -f " & quoted form of tempImage
        return "#------"
    end if
    
    -- 提取RGB值
    set r to (item 3 of colorParts) as integer
    set g to (item 4 of colorParts) as integer
    set b to (item 5 of colorParts) as integer
    
    -- 转换为HEX格式
    set hexColor to "#" & (formatHex(r) & formatHex(g) & formatHex(b))
    
    -- 清理临时文件
    do shell script "rm -f " & quoted form of tempImage
    
    return hexColor
end run

-- 辅助函数: 将整数转换为两位十六进制字符串
on formatHex(n)
    set hexChars to "0123456789ABCDEF"
    set firstChar to character ((n div 16) + 1) of hexChars
    set secondChar to character ((n mod 16) + 1) of hexChars
    return firstChar & secondChar
end formatHex
