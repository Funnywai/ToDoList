# ToDoList

React + Vite project for the ToDoList application.

## Version 1.1 (main)

This release adds better task scheduling flexibility and improves room collaboration behavior.

### What's New in 1.1
- **Specific Date Multi-Select**: Create one task across multiple manually selected dates (for example: 1/2, 2/2, 4/2)
- **Specific Date Mode Toggle Button**: `pick_specific_dates` now uses a button toggle instead of a checkbox
- **Selected Date Highlighting**: Picked dates in specific-date mode are clearly highlighted
- **Automatic Room Color Assignment**: Users no longer choose room colors manually; color is assigned automatically
- **Unique Room Colors Enforced**: Members in the same room still cannot share the same color
- **Frequency Simplification**: Removed `every_2_weeks` option (available: one-time, daily, weekly)

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
- **Automatic Color Assignment**: App assigns a unique highlight color for each member in a room
- **Auto-Join on Login**: Users automatically enter their last room when logging back in

### Task Features
- **Set Deadlines**: Assign specific dates to tasks
- **Specific Date Multi-Select**: Pick multiple exact dates for a single task
- **View by Calendar**: See all tasks organized by month/date
- **Track Days Left**: Automatic calculation of remaining days until deadline
- **Status Tracking**: Mark tasks complete or revert to incomplete
- **Room Tasks**: See collaborative tasks from all room members with member names

### Data Persistence
- **Firebase Integration**: Cloud-based task and room data storage
- **LocalStorage**: Session management and preferences saved locally
- **Auto-sync**: Tasks automatically sync when logging in
- **Room Persistence**: Room membership maintained across sessions
