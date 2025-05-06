# HR File Processor

A web application that processes HR candidate data files (CSV/XLSX) with support for both experienced and fresher formats.

## Features

- Upload and process CSV or XLSX files
- Support for ZIP files containing multiple CSV/XLSX files
- Two processing formats: Experience and Fresher
- Automatic file cleanup after processing
- Modern and responsive user interface
- Drag and drop file upload

## Prerequisites

- Node.js (v14 or higher)
- npm (comes with Node.js)

## Installation

1. Clone or download this repository
2. Navigate to the project directory
3. Install server dependencies:
   ```bash
   cd server
   npm install
   ```
4. Install client dependencies:
   ```bash
   cd ../client
   npm install
   ```

## Running the Application

1. Start the server:
   ```bash
   cd server
   npm start
   ```
   The server will run on http://localhost:3001

2. Start the client:
   ```bash
   cd client
   npm start
   ```
   The client will run on http://localhost:3000

## Usage

1. Open your web browser and navigate to http://localhost:3000
2. Select the appropriate format (Experience or Fresher)
3. Upload your files by either:
   - Dragging and dropping files onto the upload area
   - Clicking the upload area and selecting files
4. Click "Process File" to start processing
5. The processed file(s) will automatically download

## Supported File Formats

- Input: CSV, XLSX, or ZIP containing these files
- Output: Processed file in the same format as input

## File Structure

```
hr-file-processor/
├── client/                 # Frontend React application
│   ├── public/            # Static files
│   ├── src/              # Source code
│   └── package.json      # Frontend dependencies
├── server/                # Backend Node.js application
│   ├── uploads/          # Temporary file storage
│   ├── server.js         # Main server code
│   └── package.json      # Backend dependencies
└── README.md             # This file
```

## Sharing the Application

To share this application with others:

1. Create a ZIP file containing:
   - The entire project directory
   - This README file
   - Any additional documentation

2. Share the ZIP file with others

3. Recipients should follow the Installation and Running instructions above

## Troubleshooting

If you encounter any issues:

1. Make sure all dependencies are installed correctly
2. Check that both server and client are running
3. Ensure the ports (3000 and 3001) are not being used by other applications
4. Check the console for any error messages

## License

This project is licensed under the ISC License. 