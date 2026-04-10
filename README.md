# ToDoList

React + Vite project for the ToDoList application.

## Version 1 Features

### Core Functionality
- **User Authentication**: Sign up and login system with password hashing
- **Personal Task Management**: Create, edit, delete, and mark tasks as done
- **Calendar View**: Browse tasks by month with day-by-day task overview
- **Done Page**: View completed tasks separately
- **Theme Toggle**: Switch between light and dark mode

### Collaboration Features (Rooms)
- **Create Rooms**: Start a shared room and get a unique room code
- **Join Rooms**: Enter existing rooms using room codes
- **Member Management**: View room members with color-coded identification
- **Single Room Per User**: Users can only be in one room at a time
- **Color Selection**: Pick unique highlight colors for differentiation in rooms
- **Auto-Join on Login**: Users automatically enter their last room when logging back in

### Task Features
- **Set Deadlines**: Assign specific dates to tasks
- **View by Calendar**: See all tasks organized by month/date
- **Track Days Left**: Automatic calculation of remaining days until deadline
- **Status Tracking**: Mark tasks complete or revert to incomplete
- **Room Tasks**: See collaborative tasks from all room members with member names

### Data Persistence
- **Firebase Integration**: Cloud-based task and room data storage
- **LocalStorage**: Session management and preferences saved locally
- **Auto-sync**: Tasks automatically sync when logging in
- **Room Persistence**: Room membership maintained across sessions
