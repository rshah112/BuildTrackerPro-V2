import PhotosUI
import SwiftUI
import UIKit

enum ImageDataProcessor {
    static func optimizedJPEGData(from data: Data, maxDimension: CGFloat, compressionQuality: CGFloat) -> Data? {
        guard let image = UIImage(data: data) else { return nil }
        return optimizedJPEGData(from: image, maxDimension: maxDimension, compressionQuality: compressionQuality)
    }

    static func optimizedJPEGData(from image: UIImage, maxDimension: CGFloat, compressionQuality: CGFloat) -> Data? {
        let size = image.size
        let largestSide = max(size.width, size.height)
        guard largestSide > 0 else { return nil }

        let scale = min(1, maxDimension / largestSide)
        let targetSize = CGSize(width: size.width * scale, height: size.height * scale)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true

        let renderer = UIGraphicsImageRenderer(size: targetSize, format: format)
        let rendered = renderer.image { _ in
            UIColor.systemBackground.setFill()
            UIBezierPath(rect: CGRect(origin: .zero, size: targetSize)).fill()
            image.draw(in: CGRect(origin: .zero, size: targetSize))
        }

        return rendered.jpegData(compressionQuality: compressionQuality)
    }
}

struct CameraPicker: UIViewControllerRepresentable {
    let onImage: (UIImage) -> Void
    @Environment(\.dismiss) private var dismiss

    func makeCoordinator() -> Coordinator {
        Coordinator(parent: self)
    }

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.delegate = context.coordinator
        let sourceType: UIImagePickerController.SourceType = UIImagePickerController
            .isSourceTypeAvailable(.camera) ? .camera : .photoLibrary
        picker.sourceType = sourceType
        picker.mediaTypes = ["public.image"]
        picker.allowsEditing = false
        picker.modalPresentationStyle = .fullScreen

        if sourceType == .camera {
            picker.cameraCaptureMode = .photo
        }

        return picker
    }

    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}

    final class Coordinator: NSObject, UINavigationControllerDelegate, UIImagePickerControllerDelegate {
        private let parent: CameraPicker

        init(parent: CameraPicker) {
            self.parent = parent
        }

        func imagePickerController(
            _ picker: UIImagePickerController,
            didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
        ) {
            if let image = info[.originalImage] as? UIImage {
                parent.onImage(image)
            }

            parent.dismiss()
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            parent.dismiss()
        }
    }
}

struct PhotoThumbnail: View {
    let data: Data?
    var cornerRadius: CGFloat = AppTheme.cardRadius
    var contentMode: ContentMode = .fill

    @State private var decodedImage: UIImage?

    var body: some View {
        Group {
            if let decodedImage {
                Image(uiImage: decodedImage)
                    .resizable()
                    .aspectRatio(contentMode: contentMode)
            } else {
                ZStack {
                    LinearGradient(
                        colors: [AppTheme.accent.opacity(0.32), Color.primary.opacity(0.08)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )

                    Image(systemName: "camera.metering.center.weighted")
                        .font(.title2.weight(.semibold))
                        .foregroundStyle(AppTheme.accent)
                }
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
        .task(id: data) {
            decodedImage = await Self.decode(data)
        }
    }

    private static func decode(_ data: Data?) async -> UIImage? {
        guard let data else { return nil }
        return await Task.detached(priority: .userInitiated) {
            UIImage(data: data)
        }.value
    }
}
