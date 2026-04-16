# ToDoList

ToDoList is a React + Vite task management app with personal deadlines, calendar views, and shared room collaboration.

## Version 1.1.1

This release focuses on bug fixes and stability improvements.

### Bug Fixes
1. Main page now shows undone overdue tasks instead of hiding them.
2. Overdue tasks are clearly labeled with overdue status and overdue-day display.
3. Room reconnect now works across devices by checking room membership from Firebase after login.
4. Users no longer need to manually re-enter room code on a new device if they are already a room member.

## Version 1.1 Highlights

### Scheduling
1. Specific date multi-select for one task across multiple custom dates.
2. Simplified frequency options: one-time, daily, weekly.
3. Improved date picker interactions and selected date highlighting.

### Collaboration
1. Create room and join room by room code.
2. Unique member color assignment inside each room.
3. Shared room calendar with member-tagged tasks.

### Core Features
1. User authentication (sign up and login).
2. Personal task operations: create, edit, delete, done, undone.
3. Calendar overview and completed-task page.
4. Light and dark theme toggle.

## Tech Stack

1. React
2. Vite
3. Firebase Realtime Database

## Run Locally

1. Install dependencies:

	npm install

2. Start development server:

	npm run dev

3. Build for production:

	npm run build
