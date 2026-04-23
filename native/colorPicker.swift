import Foundation
import CoreGraphics
import AppKit

/// 在给定绝对屏幕坐标处采样像素颜色，返回 #RRGGBB。
/// 支持多显示器和 Retina 缩放。
///
/// 用法: ColorPicker <screenX> <screenY>
/// 输出: #RRGGBB 或 #------（失败时）

func getColorAtPosition(x: CGFloat, y: CGFloat) -> String {
    // 遍历所有显示器，找到包含目标坐标的那个
    let displays = NSScreen.screens ?? []
    var targetDisplayID: UInt32 = CGMainDisplayID()
    var found = false

    for screen in displays {
        guard let desc = screen.deviceDescription as? [String: Any],
              let displayID = desc["NSScreenNumber"] as? UInt32 else {
            continue
        }
        let frame = screen.frame
        // NSScreen.frame 使用 AppKit 坐标系（原点在左下角），需要转换
        // CGDisplay 使用 Quartz 坐标系（原点在左上角）
        // 将 AppKit 坐标转换为 Quartz 坐标
        let quartzY = CGDisplayPixelsHigh(displayID) - (y - frame.origin.y) - 1

        let bounds = CGDisplayBounds(displayID)
        if x >= bounds.origin.x && x < bounds.origin.x + bounds.size.width &&
           quartzY >= bounds.origin.y && quartzY < bounds.origin.y + bounds.size.height {
            targetDisplayID = displayID
            found = true
            break
        }
    }

    if !found {
        // 回退到主显示器
        targetDisplayID = CGMainDisplayID()
    }

    // 获取目标显示器的屏幕图像
    guard let image = CGDisplayCreateImage(targetDisplayID) else {
        return "#------"
    }

    let imageWidth = CGFloat(CGImageGetWidth(image))
    let imageHeight = CGFloat(CGImageGetHeight(image))
    let bounds = CGDisplayBounds(targetDisplayID)

    // 计算在图像中的像素坐标
    // 对于主显示器，Quartz 坐标直接对应图像坐标
    // 对于非主显示器，需要减去显示器的 origin
    var pixelX = x - bounds.origin.x
    var pixelY: CGFloat

    if targetDisplayID == CGMainDisplayID() {
        // 主显示器：直接使用转换后的 Quartz Y 坐标
        pixelY = CGDisplayPixelsHigh(targetDisplayID) - y - 1
    } else {
        // 非主显示器：使用相对于显示器边界的坐标
        let mainScreenHeight = CGDisplayPixelsHigh(CGMainDisplayID())
        // 将全局 AppKit Y 转换为全局 Quartz Y
        let globalQuartzY = mainScreenHeight - y - 1
        pixelY = globalQuartzY - bounds.origin.y
    }

    // 边界检查
    if pixelX < 0 || pixelX >= imageWidth || pixelY < 0 || pixelY >= imageHeight {
        return "#------"
    }

    // 创建 1x1 上下文读取该像素
    let colorSpace = CGColorSpaceCreateDeviceRGB()
    guard let context = CGContext(
        data: nil,
        width: 1,
        height: 1,
        bitsPerComponent: 8,
        bytesPerRow: 4,
        space: colorSpace,
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    ) else {
        return "#------"
    }

    // 将图像的指定像素绘制到 1x1 上下文中
    context.draw(image, in: CGRect(x: -pixelX, y: -pixelY, width: imageWidth, height: imageHeight))

    guard let data = context.data else {
        return "#------"
    }

    let pixels = data.bindMemory(to: UInt8.self, capacity: 4)
    let r = pixels[0]
    let g = pixels[1]
    let b = pixels[2]

    return String(format: "#%02X%02X%02X", r, g, b)
}

// ── 入口 ──

guard CommandLine.arguments.count == 3 else {
    fputs("Usage: ColorPicker <screenX> <screenY>\n", stderr)
    fputs("Output: #RRGGBB or #------\n", stderr)
    exit(1)
}

guard let x = CGFloat(CommandLine.arguments[1]),
      let y = CGFloat(CommandLine.arguments[2]) else {
    print("#------")
    exit(0)
}

print(getColorAtPosition(x: x, y: y))
