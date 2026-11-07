document.addEventListener("DOMContentLoaded", async () => {
    if (!window.CivicAuth || !window.CivicAPI) {
        alert("Authentication or API service is unavailable.");
        return;
    }

    const session = await window.CivicAuth.requireRole(["CITIZEN"]);
    if (!session) return;

    const reportForm = document.getElementById("reportForm");
    const photoInput = document.getElementById("photoInput");
    const dropzone = document.getElementById("dropzone");
    const photoPreview = document.getElementById("photoPreview");
    const previewImage = document.getElementById("previewImage");
    const previewFilename = document.getElementById("previewFilename");
    const removePhotoBtn = document.getElementById("removePhotoBtn");
    const detectLocationBtn = document.getElementById("detectLocationBtn");
    const locationInput = document.getElementById("location");
    const locationSuggestions = document.getElementById("locationSuggestions");
    const wardSelect = document.getElementById("ward");
    const tehsilSelect = document.getElementById("tehsil");
    const successModal = document.getElementById("successModal");
    const submitBtn = document.getElementById("submitBtn");

    let uploadedImageData = null;
    let submitting = false;

    const citizenNameInput = document.getElementById("citizenName");

    if (citizenNameInput) {
        citizenNameInput.value = session.name || "";
        citizenNameInput.readOnly = true;
    }

    function showError(message) {
        alert(message);
    }

    function handleFile(file) {
        const allowedTypes = [
            "image/jpeg",
            "image/png",
            "image/webp"
        ];

        if (!allowedTypes.includes(file.type)) {
            showError("Only JPG, PNG and WEBP images are allowed.");
            photoInput.value = "";
            return;
        }

        if (file.size > 1024 * 1024) {
            showError("The image must be 1 MB or smaller.");
            photoInput.value = "";
            return;
        }

        const reader = new FileReader();

        reader.onload = event => {
            uploadedImageData = event.target.result;
            previewImage.src = uploadedImageData;
            previewFilename.textContent = file.name;

            dropzone.style.display = "none";
            photoPreview.style.display = "flex";
        };

        reader.onerror = () => {
            showError("Unable to read the selected image.");
        };

        reader.readAsDataURL(file);
    }

    if (dropzone && photoInput) {
        ["dragenter", "dragover"].forEach(eventName => {
            dropzone.addEventListener(eventName, event => {
                event.preventDefault();
                dropzone.classList.add("dragover");
            });
        });

        ["dragleave", "drop"].forEach(eventName => {
            dropzone.addEventListener(eventName, event => {
                event.preventDefault();
                dropzone.classList.remove("dragover");
            });
        });

        dropzone.addEventListener("drop", event => {
            const file = event.dataTransfer.files?.[0];
            if (file) handleFile(file);
        });

        photoInput.addEventListener("change", event => {
            const file = event.target.files?.[0];
            if (file) handleFile(file);
        });
    }

    if (removePhotoBtn) {
        removePhotoBtn.addEventListener("click", () => {
            uploadedImageData = null;
            photoInput.value = "";
            previewImage.src = "";
            photoPreview.style.display = "none";
            dropzone.style.display = "block";
        });
    }

    if (wardSelect && window.DehradunLocations) {
        wardSelect.innerHTML =
            '<option value="" disabled selected>Select municipal ward</option>' +
            DehradunLocations.wards.map(item =>
                `<option value="${item.ward}">${item.ward}</option>`
            ).join("");

        if (tehsilSelect) {
            tehsilSelect.value = "Dehradun Sadar";
            tehsilSelect.disabled = true;
        }

        wardSelect.addEventListener("change", () => {
            const entry = DehradunLocations.forWard(wardSelect.value);

            if (locationSuggestions) {
                locationSuggestions.innerHTML = entry
                    ? entry.addresses.map(address =>
                        `<option value="${address}">`
                    ).join("")
                    : "";
            }

            if (entry && locationInput && !locationInput.value.trim()) {
                locationInput.value = entry.addresses[0];
            }
        });
    }

    if (detectLocationBtn && locationInput) {
        detectLocationBtn.addEventListener("click", () => {
            detectLocationBtn.disabled = true;
            detectLocationBtn.textContent = "Locating...";

            window.setTimeout(() => {
                const selected =
                    window.DehradunLocations &&
                    DehradunLocations.forWard(wardSelect.value);

                if (!selected) {
                    showError("Select a supported Dehradun ward first.");
                } else {
                    locationInput.value = selected.addresses[0];
                }

                detectLocationBtn.disabled = false;
                detectLocationBtn.innerHTML = "&#10003; Located";

                window.setTimeout(() => {
                    detectLocationBtn.innerHTML =
                        '<svg width="14" height="14" viewBox="0 0 24 24" ' +
                        'fill="none" stroke="currentColor" stroke-width="2">' +
                        '<path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z"/>' +
                        '<circle cx="12" cy="10" r="3"/></svg> Detect';
                }, 2500);
            }, 600);
        });
    }

    if (!reportForm) return;

    reportForm.addEventListener("submit", async event => {
        event.preventDefault();

        if (submitting) return;

        const title = document.getElementById("title").value.trim();
        const description = document.getElementById("description").value.trim();
        const category = document.getElementById("category").value;
        const location = locationInput.value.trim();
        const tehsil = tehsilSelect.value;
        const ward = wardSelect.value;

        const severityRadio =
            document.querySelector('input[name="severity"]:checked');

        const severity = severityRadio
            ? severityRadio.value
            : "Medium";

        if (
            !title ||
            !description ||
            !category ||
            !location ||
            !tehsil ||
            !ward
        ) {
            showError("Please complete all mandatory fields.");
            return;
        }

        if (title.length > 100) {
            showError("Complaint title cannot exceed 100 characters.");
            return;
        }

        if (location.length > 255) {
            showError("Location cannot exceed 255 characters.");
            return;
        }

        if (
            !window.DehradunLocations ||
            !DehradunLocations.validate(ward, tehsil, location)
        ) {
            showError(
                "Choose a supported Dehradun ward and enter a matching locality."
            );
            return;
        }

        const payload = {
            title,
            description,
            category,
            location,
            tehsil,
            ward,
            severity,
            photo: uploadedImageData
        };

        submitting = true;

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = "Submitting to PostgreSQL...";
        }

        try {
            const created = await CivicAPI.createComplaint(payload);

            if (!created || !created.id) {
                throw new Error(
                    "The server did not return a valid complaint reference."
                );
            }

            document.getElementById("assignedComplaintId").textContent =
                "#" + created.id;

            document.getElementById("modalPriorityScore").textContent =
                `${created.priorityScore} (${created.severity})`;

            document.getElementById("modalDepartment").textContent =
                created.department;

            document.getElementById("trackLink").href =
                `track.html?id=${encodeURIComponent(created.id)}`;

            successModal.style.display = "flex";

        } catch (error) {
            console.error("[Citizen Report] Submission failed:", error);

            showError(
                "Complaint was not confirmed by the server.\n\n" +
                error.message +
                "\n\nPlease check your connection and try again."
            );

        } finally {
            submitting = false;

            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = "Submit Complaint";
            }
        }
    });
});
