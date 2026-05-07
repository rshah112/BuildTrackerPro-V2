import SwiftUI

struct SettingsView: View {
    @AppStorage(AppSettingsKeys.preferLargeControls) private var preferLargeControls = true
    @AppStorage(AppSettingsKeys.showCentsInExports) private var showCentsInExports = true
    @AppStorage(AppSettingsKeys.autoFillFromScans) private var autoFillFromScans = true

    var body: some View {
        List {
            Section("Jobsite") {
                Toggle("Large touch targets", isOn: $preferLargeControls)
                Toggle("Show cents in exports", isOn: $showCentsInExports)
                Toggle("Auto-fill from receipt scans", isOn: $autoFillFromScans)
            }

            Section("Appearance") {
                LabeledContent("Color mode", value: "System")
                LabeledContent("Accent", value: "Field Green")
            }

            Section("About") {
                LabeledContent("App", value: "HomeBuild Pro")
                LabeledContent("Version", value: AppInfo.versionString)
            }
        }
        .scrollContentBackground(.hidden)
        .background(AppTheme.pageBackground)
        .navigationTitle("Settings")
    }
}
