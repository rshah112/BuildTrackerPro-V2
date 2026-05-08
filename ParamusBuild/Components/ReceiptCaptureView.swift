import SwiftUI
import UIKit
import VisionKit

/// VisionKit's document camera with auto-cropping/de-skewing, then runs the
/// receipt scanner on the first captured page. Returns a ScannedReceipt to the
/// caller along with the JPEG of the cropped page.
struct ReceiptCaptureView: UIViewControllerRepresentable {
    let onScan: (ScannedReceipt) -> Void
    @Environment(\.dismiss) private var dismiss

    func makeUIViewController(context: Context) -> VNDocumentCameraViewController {
        let controller = VNDocumentCameraViewController()
        controller.delegate = context.coordinator
        return controller
    }

    func updateUIViewController(_: VNDocumentCameraViewController, context _: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator(parent: self)
    }

    final class Coordinator: NSObject, VNDocumentCameraViewControllerDelegate {
        private let parent: ReceiptCaptureView

        init(parent: ReceiptCaptureView) {
            self.parent = parent
        }

        func documentCameraViewController(
            _: VNDocumentCameraViewController,
            didFinishWith scan: VNDocumentCameraScan
        ) {
            // Receipts: we only need the first page.
            guard scan.pageCount > 0 else {
                parent.dismiss()
                return
            }
            let image = scan.imageOfPage(at: 0)

            // Optimize then run the scanner. Don't block the dismiss.
            let optimized: UIImage = {
                guard let data = ImageDataProcessor.optimizedJPEGData(from: image, maxDimension: 2200, compressionQuality: 0.88),
                      let img = UIImage(data: data) else { return image }
                return img
            }()

            Task.detached(priority: .userInitiated) { [parent] in
                let result: ScannedReceipt
                do {
                    result = try await VisionReceiptScanner.scan(image: optimized)
                } catch {
                    result = ScannedReceipt(
                        amount: nil,
                        amountConfidence: 0,
                        amountPaid: nil,
                        vendorName: nil,
                        vendorConfidence: 0,
                        date: nil,
                        dateConfidence: 0,
                        dueDate: nil,
                        documentReference: nil,
                        paymentMethod: nil,
                        paymentReference: nil,
                        phoneNumber: nil,
                        address: nil,
                        isPaid: nil,
                        vendorTypeHint: nil,
                        imageData: optimized.jpegData(compressionQuality: 0.82)
                    )
                }
                await MainActor.run {
                    parent.onScan(result)
                }
            }

            parent.dismiss()
        }

        func documentCameraViewControllerDidCancel(_: VNDocumentCameraViewController) {
            parent.dismiss()
        }

        func documentCameraViewController(_: VNDocumentCameraViewController, didFailWithError _: Error) {
            parent.dismiss()
        }
    }
}
