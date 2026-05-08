import SwiftData
import SwiftUI

struct VendorsView: View {
    @Environment(\.modelContext) private var modelContext
    let project: Project

    @Query private var vendors: [Vendor]
    @State private var showingAddVendor = false
    @State private var showingEditVendor = false
    @State private var vendorIDToEdit: UUID?

    init(project: Project) {
        self.project = project
        let projectID = project.id
        _vendors = Query(filter: #Predicate<Vendor> { $0.projectID == projectID }, sort: \.name)
    }

    var body: some View {
        List {
            if vendors.isEmpty {
                EmptyStateView(title: "No vendors", subtitle: "Add contacts for the build team.", systemImage: "person.2")
            } else {
                ForEach(vendors) { vendor in
                    VendorRow(vendor: vendor)
                        .contentShape(Rectangle())
                        .onTapGesture {
                            vendorIDToEdit = vendor.id
                            showingEditVendor = true
                        }
                        .contextMenu {
                            Button {
                                vendorIDToEdit = vendor.id
                                showingEditVendor = true
                            } label: {
                                Label("Edit", systemImage: "pencil")
                            }

                            Button(role: .destructive) {
                                deleteVendor(withID: vendor.id)
                            } label: {
                                Label("Delete", systemImage: "trash")
                            }
                        }
                }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(AppTheme.pageBackground)
        .navigationTitle("Vendors")
        .primaryFloatingAction(title: "Vendor") {
            showingAddVendor = true
        }
        .sheet(isPresented: $showingAddVendor) {
            AddVendorView(project: project)
        }
        .sheet(isPresented: $showingEditVendor, onDismiss: {
            vendorIDToEdit = nil
        }) {
            if let vendorIDToEdit, let vendorToEdit = fetchVendor(withID: vendorIDToEdit) {
                AddVendorView(project: project, vendor: vendorToEdit)
            }
        }
    }

    private func deleteVendor(withID vendorID: UUID) {
        guard let vendor = fetchVendor(withID: vendorID) else { return }

        do {
            modelContext.delete(vendor)
            try modelContext.save()
        } catch {
            modelContext.safeRollback()
            Haptics.warning()
        }
    }

    private func fetchVendor(withID vendorID: UUID) -> Vendor? {
        let projectID = project.id
        let descriptor = FetchDescriptor<Vendor>(
            predicate: #Predicate { $0.id == vendorID && $0.projectID == projectID }
        )
        return try? modelContext.fetch(descriptor).first
    }
}

private struct VendorRow: View {
    let vendor: Vendor

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(vendor.name)
                    .font(.headline.weight(.semibold))
                Spacer()
                Text(vendor.trade)
                    .font(.caption.weight(.bold))
                    .foregroundStyle(AppTheme.accent)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 5)
                    .background(AppTheme.accent.opacity(0.12), in: Capsule())
            }

            if !vendor.phone.isEmpty || !vendor.email.isEmpty {
                HStack(spacing: 12) {
                    if let phoneURL {
                        Link(destination: phoneURL) {
                            Label(vendor.phone, systemImage: "phone")
                        }
                    }

                    if let emailURL {
                        Link(destination: emailURL) {
                            Label(vendor.email, systemImage: "envelope")
                        }
                    }
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            }

            if !vendor.notes.isEmpty {
                Text(vendor.notes)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 8)
    }

    private var phoneURL: URL? {
        let digits = vendor.phone.filter(\.isNumber)
        guard !digits.isEmpty else { return nil }
        return URL(string: "tel://\(digits)")
    }

    private var emailURL: URL? {
        guard !vendor.email.trimmed.isEmpty else { return nil }
        return URL(string: "mailto:\(vendor.email.trimmed)")
    }
}

private struct AddVendorView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext
    let project: Project
    let vendorID: UUID?

    @State private var name = ""
    @State private var trade = ""
    @State private var phone = ""
    @State private var email = ""
    @State private var notes = ""

    private var canSave: Bool {
        !name.trimmed.isEmpty && !trade.trimmed.isEmpty
    }

    init(project: Project, vendor: Vendor? = nil) {
        self.project = project
        vendorID = vendor?.id
        _name = State(initialValue: vendor?.name ?? "")
        _trade = State(initialValue: vendor?.trade ?? "")
        _phone = State(initialValue: vendor?.phone ?? "")
        _email = State(initialValue: vendor?.email ?? "")
        _notes = State(initialValue: vendor?.notes ?? "")
    }

    var body: some View {
        NavigationStack {
            ModernForm {
                ModernFormSection("Vendor") {
                    ModernField("Name") {
                        TextField("Vendor name", text: $name)
                            .modernTextField()
                    }

                    ModernField("Trade") {
                        TextField("e.g. Framing, plumbing, electrical", text: $trade)
                            .modernTextField()
                    }

                    ModernField("Phone") {
                        TextField("Phone number", text: $phone)
                            .keyboardType(.phonePad)
                            .modernTextField()
                    }

                    ModernField("Email") {
                        TextField("Email address", text: $email)
                            .keyboardType(.emailAddress)
                            .textInputAutocapitalization(.never)
                            .modernTextField()
                    }
                }

                ModernFormSection("Notes") {
                    ModernField("Notes") {
                        TextField("Optional details", text: $notes, axis: .vertical)
                            .lineLimit(3 ... 5)
                            .modernTextField()
                    }
                }
            }
            .navigationTitle(vendorID == nil ? "Add Vendor" : "Edit Vendor")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { save() }
                        .disabled(!canSave)
                }
            }
        }
    }

    private func save() {
        if let vendorID {
            guard let vendorToEdit = fetchVendor(withID: vendorID) else {
                Haptics.warning()
                return
            }
            vendorToEdit.name = name.trimmed
            vendorToEdit.trade = trade.trimmed
            vendorToEdit.phone = phone.trimmed
            vendorToEdit.email = email.trimmed
            vendorToEdit.notes = notes.trimmed
        } else {
            modelContext.insert(Vendor(
                projectID: project.id,
                name: name.trimmed,
                trade: trade.trimmed,
                phone: phone.trimmed,
                email: email.trimmed,
                notes: notes.trimmed
            ))
        }

        do {
            try modelContext.save()
            Haptics.success()
            dismiss()
        } catch {
            modelContext.safeRollback()
            Haptics.warning()
        }
    }

    private func fetchVendor(withID vendorID: UUID) -> Vendor? {
        let projectID = project.id
        let descriptor = FetchDescriptor<Vendor>(
            predicate: #Predicate { $0.id == vendorID && $0.projectID == projectID }
        )
        return try? modelContext.fetch(descriptor).first
    }
}
