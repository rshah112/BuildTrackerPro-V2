import QuickLook
import SwiftUI
import UIKit

/// Stand-alone view of every receipt/invoice scanned for the project, sourced
/// from `Documents/Projects/<project>/Receipts/` on disk (not from SwiftData).
/// Survives app corruption: this folder is browseable directly via Files.app.
struct ReceiptsGalleryView: View {
    let project: Project

    @State private var urls: [URL] = []
    @State private var quickLookURL: URL?

    private let columns = [GridItem(.adaptive(minimum: 110), spacing: 8)]

    var body: some View {
        Group {
            if urls.isEmpty {
                EmptyStateView(
                    title: "No receipts yet",
                    subtitle: "Receipts and invoices you scan when adding an expense will live here.",
                    systemImage: "doc.viewfinder"
                )
            } else {
                ScrollView {
                    LazyVGrid(columns: columns, spacing: 8) {
                        ForEach(urls, id: \.path) { url in
                            ReceiptThumbnail(url: url)
                                .aspectRatio(1, contentMode: .fill)
                                .clipShape(RoundedRectangle(cornerRadius: AppTheme.Radius.sm, style: .continuous))
                                .onTapGesture { quickLookURL = url }
                                .contextMenu {
                                    Button {
                                        quickLookURL = url
                                    } label: {
                                        Label("Open", systemImage: "eye")
                                    }
                                    ShareLink(item: url) {
                                        Label("Share", systemImage: "square.and.arrow.up")
                                    }
                                }
                        }
                    }
                    .padding(AppTheme.pagePadding)
                }
            }
        }
        .background(AppTheme.pageBackground)
        .navigationTitle("Receipts")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { reload() }
        .sheet(item: Binding(
            get: { quickLookURL.map(QuickLookItem.init) },
            set: { quickLookURL = $0?.url }
        )) { item in
            QuickLookSheet(url: item.url)
        }
    }

    private func reload() {
        urls = MediaStorageService.receiptURLs(for: project)
    }
}

private struct QuickLookItem: Identifiable {
    let url: URL
    var id: String {
        url.path
    }
}

private struct ReceiptThumbnail: View {
    let url: URL
    @State private var image: UIImage?

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image).resizable().scaledToFill()
            } else {
                Rectangle().fill(AppTheme.surfaceSunken)
            }
        }
        .task(id: url) {
            image = await Self.decode(url)
        }
    }

    private static func decode(_ url: URL) async -> UIImage? {
        await Task.detached(priority: .userInitiated) {
            (try? Data(contentsOf: url)).flatMap(UIImage.init(data:))
        }.value
    }
}

private struct QuickLookSheet: UIViewControllerRepresentable {
    let url: URL

    func makeCoordinator() -> Coordinator {
        Coordinator(url: url)
    }

    func makeUIViewController(context: Context) -> QLPreviewController {
        let controller = QLPreviewController()
        controller.dataSource = context.coordinator
        return controller
    }

    func updateUIViewController(_: QLPreviewController, context _: Context) {}

    final class Coordinator: NSObject, QLPreviewControllerDataSource {
        private let url: URL
        init(url: URL) {
            self.url = url
        }

        func numberOfPreviewItems(in _: QLPreviewController) -> Int {
            1
        }

        func previewController(_: QLPreviewController, previewItemAt _: Int) -> any QLPreviewItem {
            url as NSURL
        }
    }
}
