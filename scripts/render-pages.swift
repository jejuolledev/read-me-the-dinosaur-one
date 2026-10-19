// Render every page of each sample-book PDF to JPEG with PDFKit (macOS only, no extra tools to install).
// usage: swift scripts/render-pages.swift <pdf-dir> <out-dir> [width=960] [quality=0.78]
// Draws into an explicit bitmap context so the output is exactly <width> pixels wide (no Retina doubling).
import Foundation
import PDFKit
import ImageIO
import UniformTypeIdentifiers

let args = CommandLine.arguments
guard args.count >= 3 else { print("usage: render-pages.swift <pdf-dir> <out-dir> [width] [quality]"); exit(1) }
let pdfDir = args[1], outDir = args[2]
let width = args.count > 3 ? Int(args[3])! : 960
let quality = args.count > 4 ? Double(args[4])! : 0.78
let fm = FileManager.default
let pdfs = try fm.contentsOfDirectory(atPath: pdfDir).filter { $0.hasSuffix(".pdf") }.sorted()
for name in pdfs {
  let slug = String(name.dropLast(4))
  guard let doc = PDFDocument(url: URL(fileURLWithPath: "\(pdfDir)/\(name)")) else { print("skip \(name)"); continue }
  let dir = "\(outDir)/\(slug)"
  try fm.createDirectory(atPath: dir, withIntermediateDirectories: true)
  for i in 0..<doc.pageCount {
    guard let page = doc.page(at: i) else { continue }
    let box = page.bounds(for: .mediaBox)
    let scale = CGFloat(width) / box.width
    let h = Int((box.height * scale).rounded())
    guard let ctx = CGContext(data: nil, width: width, height: h, bitsPerComponent: 8, bytesPerRow: 0,
                              space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { continue }
    ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1)); ctx.fill(CGRect(x: 0, y: 0, width: width, height: h))
    ctx.interpolationQuality = .high
    ctx.scaleBy(x: scale, y: scale)
    page.draw(with: .mediaBox, to: ctx)
    guard let img = ctx.makeImage() else { continue }
    let out = URL(fileURLWithPath: String(format: "%@/p%02d.jpg", dir, i))
    guard let dest = CGImageDestinationCreateWithURL(out as CFURL, UTType.jpeg.identifier as CFString, 1, nil) else { continue }
    CGImageDestinationAddImage(dest, img, [kCGImageDestinationLossyCompressionQuality: quality] as CFDictionary)
    CGImageDestinationFinalize(dest)
  }
  print("\(slug): \(doc.pageCount) pages -> \(dir)")
}
