document.addEventListener('DOMContentLoaded', () => {
    const reportForm = document.getElementById('reportForm');
    const photoInput = document.getElementById('photoInput');
    const dropzone = document.getElementById('dropzone');
    const photoPreview = document.getElementById('photoPreview');
    const previewImage = document.getElementById('previewImage');
    const previewFilename = document.getElementById('previewFilename');
    const removePhotoBtn = document.getElementById('removePhotoBtn');
    const detectLocationBtn = document.getElementById('detectLocationBtn');
    const locationInput = document.getElementById('location');
    const successModal = document.getElementById('successModal');

    let uploadedImageData = null;

    // Drag and drop photo upload
    if (dropzone && photoInput) {
        ['dragenter', 'dragover'].forEach(eventName => {
            dropzone.addEventListener(eventName, (e) => {
                e.preventDefault();
                dropzone.classList.add('dragover');
            });
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropzone.addEventListener(eventName, (e) => {
                e.preventDefault();
                dropzone.classList.remove('dragover');
            });
        });

        dropzone.addEventListener('drop', (e) => {
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                handleFile(e.dataTransfer.files[0]);
            }
        });

        photoInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                handleFile(e.target.files[0]);
            }
        });
    }

    function handleFile(file) {
        if (!file.type.startsWith('image/')) {
            alert('Please upload an image file (JPG, PNG, WEBP).');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            uploadedImageData = e.target.result;
            previewImage.src = uploadedImageData;
            previewFilename.textContent = file.name;
            dropzone.style.display = 'none';
            photoPreview.style.display = 'flex';
        };
        reader.readAsDataURL(file);
    }

    if (removePhotoBtn) {
        removePhotoBtn.addEventListener('click', () => {
            uploadedImageData = null;
            photoInput.value = '';
            previewImage.src = '';
            photoPreview.style.display = 'none';
            dropzone.style.display = 'block';
        });
    }

    // Geolocation detection simulation
    if (detectLocationBtn && locationInput) {
        detectLocationBtn.addEventListener('click', () => {
            detectLocationBtn.disabled = true;
            detectLocationBtn.innerHTML = 'Locating...';
            
            setTimeout(() => {
                locationInput.value = 'Near DLF Phase 2, Cyber Hub Road (28.4950° N, 77.0895° E)';
                detectLocationBtn.disabled = false;
                detectLocationBtn.innerHTML = '&#10003; Located';
                setTimeout(() => {
                    detectLocationBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z"/><circle cx="12" cy="10" r="3"/></svg> Detect';
                }, 2500);
            }, 600);
        });
    }

    // Form submission
    if (reportForm) {
        reportForm.addEventListener('submit', (e) => {
            e.preventDefault();

            const title = document.getElementById('title').value.trim();
            const description = document.getElementById('description').value.trim();
            const category = document.getElementById('category').value;
            const location = document.getElementById('location').value.trim();
            const ward = document.getElementById('ward').value;
            const severityRadio = document.querySelector('input[name="severity"]:checked');
            const severity = severityRadio ? severityRadio.value : 'Medium';
            const citizenName = document.getElementById('citizenName').value.trim() || 'Anonymous Citizen';

            if (!category || !title || !description || !location) {
                alert('Please fill in all mandatory fields.');
                return;
            }

            // Department mapping
            const deptMap = {
                'Roads': 'Road Infrastructure & Maintenance',
                'Water': 'Municipal Water & Sewerage Board',
                'Waste': 'Solid Waste & Sanitation Department',
                'Lighting': 'Electrical & Street Lighting Wing',
                'Drainage': 'Stormwater Drainage Division',
                'Electricity': 'State Electricity Board',
                'Other': 'General Municipal Works'
            };

            // Calculate initial OS priority score
            const severityBaseScores = { 'Low': 40, 'Medium': 60, 'High': 75, 'Critical': 90 };
            const baseScore = severityBaseScores[severity] || 60;
            const randomVariance = Math.floor(Math.random() * 5);
            const calculatedScore = Math.min(99, baseScore + randomVariance);

            // Generate Complaint ID
            const newId = 'CS' + (1050 + Math.floor(Math.random() * 40));

            const newComplaint = {
                id: newId,
                title: title,
                description: description,
                category: category,
                location: location,
                ward: ward,
                severity: severity,
                department: deptMap[category] || 'Municipal Works',
                priorityScore: calculatedScore,
                status: 'Reported',
                date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                duplicateCount: 1,
                waitingDays: 0,
                agingBoost: 0,
                citizen: citizenName,
                photo: uploadedImageData || 'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?w=600&q=80&auto=format&fit=crop',
                history: [
                    {
                        step: 'Reported',
                        date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' — ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                        done: true
                    },
                    { step: 'Verified', date: 'Pending Verification', done: false },
                    { step: 'Assigned', date: 'Awaiting Department Dispatch', done: false },
                    { step: 'In Progress', date: '', done: false },
                    { step: 'Resolved', date: '', done: false }
                ]
            };

            // Store in localStorage
            try {
                const existing = JSON.parse(localStorage.getItem('civics_smart_complaints') || '[]');
                existing.unshift(newComplaint);
                localStorage.setItem('civics_smart_complaints', JSON.stringify(existing));
            } catch (err) {
                console.error('Storage error:', err);
            }

            // Update modal
            document.getElementById('assignedComplaintId').textContent = '#' + newId;
            document.getElementById('modalPriorityScore').textContent = `${calculatedScore} (${severity})`;
            document.getElementById('modalDepartment').textContent = deptMap[category];
            document.getElementById('trackLink').href = `track.html?id=${newId}`;

            successModal.style.display = 'flex';
        });
    }
});
