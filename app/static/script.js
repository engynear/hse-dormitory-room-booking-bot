document.addEventListener('DOMContentLoaded', function() {
    const tg = window.Telegram.WebApp;
    tg.ready();
    tg.expand();

    // --- DOM Elements ---
    const bookingForm = document.getElementById('booking-form');
    const myBookingsDiv = document.getElementById('my-bookings');
    const roomMap = document.getElementById('room-map');
    const selectedRoomInput = document.getElementById('selected-room-input');
    const dateInput = document.getElementById('date-input');
    const startTimeInput = document.getElementById('start-time-input');
    const endTimeInput = document.getElementById('end-time-input');
    const timelineContainer = document.getElementById('timeline-container');
    const timeline = document.getElementById('timeline');
    const timelineTooltip = document.getElementById('timeline-tooltip');
    
    // --- Pop-up Elements ---
    const errorPopup = document.getElementById('error-popup');
    const errorMessage = document.getElementById('error-message');
    const closeBtn = document.querySelector('.close-btn');

    // --- State ---
    let state = {
        rooms: [],
        dailyBookings: [],
        selectedRoom: null,
    };

    const headers = {
        'Content-Type': 'application/json',
        'X-Telegram-Init-Data': tg.initData
    };

    // --- Pop-up Logic ---
    function showError(message) {
        errorMessage.textContent = message;
        errorPopup.style.display = 'block';
    }
    closeBtn.onclick = () => errorPopup.style.display = 'none';
    window.onclick = (event) => {
        if (event.target == errorPopup) errorPopup.style.display = 'none';
    };

    // --- Time & Date Helpers ---
    function getTodayString() {
        const today = new Date();
        return today.toISOString().split('T')[0];
    }
    function timeToMinutes(time) {
        const [hours, minutes] = time.split(':').map(Number);
        return hours * 60 + minutes;
    }

    // --- API Calls ---
    async function fetchApi(url, options = {}) {
        const response = await fetch(url, { headers, ...options });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || `Ошибка: ${response.status}`);
        }
        return response.json();
    }

    async function fetchRooms() {
        try {
            state.rooms = await fetchApi('/api/rooms');
            renderRoomMap();
        } catch (error) {
            showError('Не удалось загрузить список комнат.');
        }
    }

    async function fetchMyBookings() {
        myBookingsDiv.innerHTML = '<p>Загрузка...</p>';
        try {
            const bookings = await fetchApi('/api/my-bookings');
            renderMyBookings(bookings);
        } catch (error) {
            myBookingsDiv.innerHTML = `<p>${error.message}</p>`;
            showError(error.message);
        }
    }

    async function fetchBookingsByDateAndUpdateUI() {
        if (!dateInput.value) return;
        try {
            state.dailyBookings = await fetchApi(`/api/bookings-by-date?date=${dateInput.value}`);
            updateRoomsVisualState();
            updateTimeline();
        } catch (error) {
            showError('Не удалось загрузить бронирования на эту дату.');
        }
    }
    
    // --- Rendering ---
    function renderRoomMap() {
        roomMap.innerHTML = '';
        const roomToAreaMap = {
            'Тенниска': 'tennis',
            'Боталка в блоках': 'blocks',
            'Боталка в коридорах 2 этажа': 'corridor2',
            'Боталка в коридорах 3 этажа': 'corridor3'
        };
        state.rooms.forEach(roomName => {
            const roomEl = document.createElement('div');
            roomEl.className = 'room-block';
            roomEl.textContent = roomName;
            roomEl.dataset.roomName = roomName;
            if (roomToAreaMap[roomName]) roomEl.style.gridArea = roomToAreaMap[roomName];
            roomMap.appendChild(roomEl);
        });
    }

    function renderMyBookings(bookings) {
        if (bookings.length === 0) {
            myBookingsDiv.innerHTML = '<p>У вас нет активных бронирований.</p>';
            return;
        }
        myBookingsDiv.innerHTML = bookings.map(b => {
            const start = new Date(b.start_time + 'Z');
            const end = new Date(b.end_time + 'Z');
            const options = { day: '2-digit', month: '2-digit', year: 'numeric' };
            const dateStr = start.toLocaleDateString('ru-RU', options);
            const startTimeStr = start.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
            const endTimeStr = end.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
            return `
                <div class="booking-item" id="booking-${b.id}">
                    <div class="booking-details">
                        <strong>${b.room}</strong><br>
                        <span class="booking-date-time">${dateStr} ${startTimeStr} – ${endTimeStr}</span>
                        ${b.reason ? `<br><small style="color: var(--tg-theme-hint-color);">${b.reason}</small>` : ''}
                    </div>
                    <button class="delete-btn" data-booking-id="${b.id}">Удалить</button>
                </div>`;
        }).join('');
    }

    function updateRoomsVisualState() {
        if (!dateInput.value || !startTimeInput.value || !endTimeInput.value) return;
        const userStartLocal = new Date(`${dateInput.value}T${startTimeInput.value}:00`);
        const userEndLocal = new Date(`${dateInput.value}T${endTimeInput.value}:00`);
        document.querySelectorAll('.room-block').forEach(roomEl => {
            const roomName = roomEl.dataset.roomName;
            const bookingsForRoom = state.dailyBookings.filter(b => b.room === roomName);
            const isBusy = bookingsForRoom.some(b => {
                const bookingStartUTC = new Date(b.start_time + 'Z');
                const bookingEndUTC = new Date(b.end_time + 'Z');
                return userStartLocal.getTime() < bookingEndUTC.getTime() && userEndLocal.getTime() > bookingStartUTC.getTime();
            });
            roomEl.classList.toggle('busy', isBusy);
            roomEl.classList.toggle('free', !isBusy);
        });
    }

    function updateTimeline() {
        if (!state.selectedRoom || !dateInput.value) {
            timelineContainer.style.display = 'none';
            return;
        }
        timelineContainer.style.display = 'block';
        timeline.innerHTML = '';
        const bookingsForRoom = state.dailyBookings.filter(b => b.room === state.selectedRoom);
        bookingsForRoom.forEach(b => {
            const bookingStartLocal = new Date(b.start_time + 'Z');
            const bookingEndLocal = new Date(b.end_time + 'Z');
            const startMinutes = bookingStartLocal.getHours() * 60 + bookingStartLocal.getMinutes();
            const endMinutes = bookingEndLocal.getHours() * 60 + bookingEndLocal.getMinutes();
            
            const startTimeStr = bookingStartLocal.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
            const endTimeStr = bookingEndLocal.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

            const slot = document.createElement('div');
            slot.className = 'timeline-slot';
            slot.style.left = `${(startMinutes / 1440) * 100}%`;
            slot.style.width = `${((endMinutes - startMinutes) / 1440) * 100}%`;
            
            let info = `Кто: @${b.user.username}<br>Комната: ${b.user_room_number}<br>Время: ${startTimeStr} - ${endTimeStr}`;
            if (b.reason) {
                info += `<br>Причина: ${b.reason}`;
            }
            slot.dataset.info = info;

            slot.dataset.username = b.user.username;
            timeline.appendChild(slot);
        });
        if (startTimeInput.value && endTimeInput.value) {
            const userStartMinutes = timeToMinutes(startTimeInput.value);
            const userEndMinutes = timeToMinutes(endTimeInput.value);
            const selection = document.createElement('div');
            selection.className = 'timeline-user-selection';
            selection.style.left = `${(userStartMinutes / 1440) * 100}%`;
            selection.style.width = `${((userEndMinutes - userStartMinutes) / 1440) * 100}%`;
            timeline.appendChild(selection);
        }
    }
    
    // --- Event Handlers ---
    function handleTimeChange() {
        const start = startTimeInput.value;
        if (!start) return;
        const startMinutes = timeToMinutes(start);
        if (!endTimeInput.value || timeToMinutes(endTimeInput.value) < startMinutes) {
             const newEndMinutes = startMinutes + 15;
             endTimeInput.value = `${String(Math.floor(newEndMinutes / 60) % 24).padStart(2, '0')}:${String(newEndMinutes % 60).padStart(2, '0')}`;
        }
        const maxEndMinutes = startMinutes + 4 * 60;
        endTimeInput.min = start;
        endTimeInput.max = `${String(Math.floor(maxEndMinutes / 60) % 24).padStart(2, '0')}:${String(maxEndMinutes % 60).padStart(2, '0')}`;
        updateRoomsVisualState();
        if (state.selectedRoom) {
            const selectedRoomEl = roomMap.querySelector(`.room-block[data-room-name="${state.selectedRoom}"]`);
            if (selectedRoomEl && selectedRoomEl.classList.contains('busy')) {
                selectedRoomEl.classList.remove('selected');
                state.selectedRoom = null;
                selectedRoomInput.value = '';
                tg.HapticFeedback.notificationOccurred('warning');
                showError("Комната стала недоступна для нового времени. Выберите другую.");
            }
        }
        updateTimeline();
    }

    function handleRoomClick(event) {
        const roomEl = event.target.closest('.room-block');
        if (!roomEl || roomEl.classList.contains('busy')) return;
        document.querySelectorAll('.room-block.selected').forEach(el => el.classList.remove('selected'));
        roomEl.classList.add('selected');
        state.selectedRoom = roomEl.dataset.roomName;
        selectedRoomInput.value = state.selectedRoom;
        updateTimeline();
    }

    async function handleFormSubmit(event) {
        event.preventDefault();
        if (!state.selectedRoom) {
            showError("Пожалуйста, выберите свободную комнату.");
            return;
        }
        const selectedRoomEl = roomMap.querySelector(`.room-block[data-room-name="${state.selectedRoom}"]`);
        if (selectedRoomEl.classList.contains('busy')) {
            showError("Выбранная комната занята на это время. Пожалуйста, выберите другое время или комнату.");
            return;
        }
        if (timeToMinutes(endTimeInput.value) - timeToMinutes(startTimeInput.value) < 15) {
            showError("Минимальная длительность бронирования - 15 минут.");
            return;
        }
        const userRoomInput = document.getElementById('user-room-input');
        const roomNumberPattern = /^\d{3,4}$/;
        if (!roomNumberPattern.test(userRoomInput.value)) {
            showError("Пожалуйста, введите корректный номер комнаты (3 или 4 цифры).");
            userRoomInput.focus();
            return;
        }
        const bookingData = {
            room: state.selectedRoom,
            start_time: new Date(`${dateInput.value}T${startTimeInput.value}:00`).toISOString(),
            end_time: new Date(`${dateInput.value}T${endTimeInput.value}:00`).toISOString(),
            user_room_number: userRoomInput.value,
            reason: document.getElementById('reason-input').value || null
        };
        try {
            await fetchApi('/api/book', { method: 'POST', body: JSON.stringify(bookingData) });
            tg.HapticFeedback.notificationOccurred('success');
            tg.showAlert('Комната успешно забронирована!');
            
            await Promise.all([fetchMyBookings(), fetchBookingsByDateAndUpdateUI()]);
            
            bookingForm.reset();
            dateInput.value = getTodayString();
            state.selectedRoom = null;
            selectedRoomInput.value = '';
            document.querySelectorAll('.room-block.selected').forEach(el => el.classList.remove('selected'));
            timelineContainer.style.display = 'none';
        } catch (error) {
            tg.HapticFeedback.notificationOccurred('error');
            showError(error.message);
        }
    }

    async function handleDeleteClick(event) {
        if (!event.target.classList.contains('delete-btn')) return;
        const bookingId = event.target.dataset.bookingId;
        tg.showConfirm('Вы уверены, что хотите удалить это бронирование?', async (confirmed) => {
            if (confirmed) {
                try {
                    await fetchApi(`/api/booking/${bookingId}`, { method: 'DELETE' });
                    tg.HapticFeedback.notificationOccurred('success');
                    await Promise.all([fetchMyBookings(), fetchBookingsByDateAndUpdateUI()]);
                } catch (error) {
                    tg.HapticFeedback.notificationOccurred('error');
                    showError(error.message);
                }
            }
        });
    }

    function setupEventListeners() {
        dateInput.addEventListener('change', fetchBookingsByDateAndUpdateUI);
        startTimeInput.addEventListener('change', handleTimeChange);
        endTimeInput.addEventListener('change', () => {
            updateRoomsVisualState();
            updateTimeline();
        });
        roomMap.addEventListener('click', handleRoomClick);
        bookingForm.addEventListener('submit', handleFormSubmit);
        myBookingsDiv.addEventListener('click', handleDeleteClick);

        timeline.addEventListener('mouseover', e => {
            if (e.target.classList.contains('timeline-slot')) {
                timelineTooltip.innerHTML = e.target.dataset.info;
                timelineTooltip.style.display = 'block';
            }
        });
        timeline.addEventListener('mousemove', e => {
            const tooltip = timelineTooltip;
            const tooltipWidth = tooltip.offsetWidth;
            const windowWidth = window.innerWidth;

            let left = e.pageX + 15;
            
            // If tooltip goes off the right edge, position it to the left of the cursor
            if (left + tooltipWidth + 5 > windowWidth) {
                left = e.pageX - tooltipWidth - 15;
            }

            tooltip.style.left = `${left}px`;
            tooltip.style.top = `${e.pageY + 15}px`;
        });
        timeline.addEventListener('mouseout', () => {
            timelineTooltip.style.display = 'none';
        });
        timeline.addEventListener('click', e => {
            if (e.target.classList.contains('timeline-slot')) {
                const username = e.target.dataset.username;
                if (username) {
                    tg.openTelegramLink(`https://t.me/${username}`);
                }
            }
        });
    }

    // --- Initializer ---
    function init() {
        dateInput.value = getTodayString();
        dateInput.min = getTodayString();
        setupEventListeners();
        fetchRooms();
        fetchMyBookings();
        fetchBookingsByDateAndUpdateUI();
    }

    init();
}); 