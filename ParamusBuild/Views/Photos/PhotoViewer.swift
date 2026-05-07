import SwiftUI
import UIKit

struct PhotoViewer: View {
    let photo: PhotoAttachment
    @Environment(\.dismiss) private var dismiss
    @State private var dragOffset: CGFloat = 0
    @State private var isSharePresented = false

    private var loadedImage: UIImage? {
        guard let data = photo.imageData else { return nil }
        return UIImage(data: data)
    }

    var body: some View {
        ZStack {
            Color.black
                .ignoresSafeArea()
                .opacity(max(0, 1 - Double(abs(dragOffset)) / 400))

            if let image = loadedImage {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
                    .ignoresSafeArea()
                    .offset(y: dragOffset)
            } else {
                PhotoThumbnail(data: nil, cornerRadius: 0)
                    .ignoresSafeArea()
            }

            VStack {
                HStack {
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.headline.weight(.bold))
                            .foregroundStyle(.white)
                            .frame(width: 44, height: 44)
                            .background(.black.opacity(0.48), in: Circle())
                    }

                    Spacer()

                    if loadedImage != nil {
                        Button {
                            isSharePresented = true
                        } label: {
                            Image(systemName: "square.and.arrow.up")
                                .font(.headline.weight(.bold))
                                .foregroundStyle(.white)
                                .frame(width: 44, height: 44)
                                .background(.black.opacity(0.48), in: Circle())
                        }
                    }
                }
                .padding()

                Spacer()

                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text(photo.phaseTag.isEmpty ? "Photo" : photo.phaseTag)
                            .font(.headline.weight(.bold))
                        Spacer()
                        Text(photo.createdAt.shortDateString)
                            .font(.subheadline.weight(.semibold))
                    }

                    if !photo.roomTag.isEmpty {
                        Label(photo.roomTag, systemImage: "mappin")
                            .font(.subheadline)
                    }

                    if !photo.notes.isEmpty {
                        Text(photo.notes)
                            .font(.subheadline)
                            .foregroundStyle(.white.opacity(0.78))
                    }
                }
                .foregroundStyle(.white)
                .padding(16)
                .background(.black.opacity(0.56), in: RoundedRectangle(cornerRadius: AppTheme.cardRadius, style: .continuous))
                .padding()
            }
        }
        .gesture(
            DragGesture()
                .onChanged { value in
                    if value.translation.height > 0 {
                        dragOffset = value.translation.height
                    }
                }
                .onEnded { value in
                    if value.translation.height > 120 {
                        dismiss()
                    } else {
                        withAnimation(.spring()) { dragOffset = 0 }
                    }
                }
        )
        .sheet(isPresented: $isSharePresented) {
            if let image = loadedImage {
                ShareSheet(items: [image])
            }
        }
    }
}

private struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}
