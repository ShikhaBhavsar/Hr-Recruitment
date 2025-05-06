const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const csv = require('csv-parser');
const AdmZip = require('adm-zip');
const archiver = require('archiver');
const { parse: csvParse } = require('csv-parse/sync'); // For CSV files
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3001;

// Enable CORS
app.use(cors());

// Define the exact columns and mappings for both formats
const EXPERIENCE_COLUMN_MAPPING = {
    'Tags': 'Applicaiton Date',
    'CREATED_DATE': 'Updation Date',
    'Candidate ID': 'Candidate ID',
    'Name': 'Candidate Name',
    'E-mail': 'Email',
    'Mobile No': 'Contact No.',
    'Location': 'Location',
    'How Did You Hear About This Job Opportunity?': 'Source',
    'Total Experience (in Years)': 'Total Experience',
    'Relevant Experience (in Years)': 'Relevant Experience',
    'What is your current annual salary? (Please specify in Lacs such as 4,00,000)': 'Current Salary (Annual)',
    'What is your expected annual salary? (Please specify in Lacs such as 6,00,000)': 'Expected Salary (Annual)',
    'Notice Period (in days)': 'Notice Period (in days)',
    'Status': 'Status',
    'Comments': 'Comments'
};

const FRESHER_COLUMN_MAPPING = {
    'Candidate ID': 'Candidate ID',
    'Name': 'Candidate Name',
    'E-mail': 'Email',
    'Mobile No': 'Contact No.',
    'Location': 'Location',
    'How Did You Hear About This Job Opportunity?': 'Source',
    'Name of the Institute': 'Name of Instiute',
    'Total Experience (in Years)': 'Experience',
    'Tags': 'Application Date',
    'CREATED_DATE': 'Updation Date',
    'Status': 'Status',
    'Comments': 'Comments'
};

const FRESHER_COLUMN_ORDER = [
    'Application Date',
    'Updation Date',
    'Candidate ID',
    'Candidate Name',
    'Email',
    'Contact No.',
    'Location',
    'Source',
    'Name of Instiute',
    'Experience',
    'Status',
    'Comments'
];

// Helper function to format date (remove time)
function formatDate(dateString) {
    if (!dateString) return '';
    // Extract text before the first space
    const parts = dateString.split(' ');
    if (parts.length > 0) {
        const datePart = parts[0];
        const dmy = datePart.split('/');
        if (dmy.length === 3) {
            // day/month/year
            const day = parseInt(dmy[0], 10);
            const month = parseInt(dmy[1], 10) - 1; // JS months are 0-based
            const year = parseInt(dmy[2], 10);
            const date = new Date(year, month, day);
            if (!isNaN(date.getTime())) {
                // Excel date number (days since 1900-01-01)
                const excelDate = Math.floor((date - new Date(1900, 0, 1)) / (1000 * 60 * 60 * 24)) + 2;
                return excelDate.toString();
            }
        }
    }
    return dateString;
}

// Helper function to convert date to number
function dateToNumber(dateString) {
    if (!dateString) return 0;
    // Extract text before the first space
    const parts = dateString.split(' ');
    if (parts.length > 0) {
        const datePart = parts[0];
        const dmy = datePart.split('/');
        if (dmy.length === 3) {
            // day/month/year
            const day = parseInt(dmy[0], 10);
            const month = parseInt(dmy[1], 10) - 1;
            const year = parseInt(dmy[2], 10);
            const date = new Date(year, month, day);
            if (!isNaN(date.getTime())) {
                return Math.floor((date - new Date(1900, 0, 1)) / (1000 * 60 * 60 * 24)) + 2;
            }
        }
    }
    return 0;
}

// Configure multer for multiple file upload
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Create uploads directory if it doesn't exist
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, '../client/build')));
    
    app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, '../client/build', 'index.html'));
    });
}

// Handle file upload and processing (multiple files)
app.post('/upload', upload.array('files'), async (req, res) => {
    if (!req.files || req.files.length === 0) {
        return res.status(400).send('No files uploaded');
    }

    // Get candidate format from request (default to experience if not provided)
    let candidateFormat = 'experience';
    if (req.body && req.body.candidateFormat) {
        candidateFormat = req.body.candidateFormat;
    }

    // Prepare a list to hold output file paths
    const outputFiles = [];
    const tempFiles = [];

    // Helper to process a single file buffer
    async function processSingleFile(fileBuffer, originalname) {
        const fileExtension = path.extname(originalname).toLowerCase();
        const outputFileName = `processed_${Date.now()}_${Math.random().toString(36).slice(2)}${fileExtension}`;
        const outputPath = path.join('uploads', outputFileName);
        if (fileExtension === '.csv') {
            await new Promise((resolve, reject) => {
                processCSV(fileBuffer, outputPath, {
                    download: (filePath) => resolve(filePath),
                    status: () => {},
                }, outputFileName, candidateFormat);
            });
            outputFiles.push({ path: outputPath, name: `processed_${originalname.replace(/\s+/g, '_')}` });
            tempFiles.push(outputPath);
        } else if (fileExtension === '.xlsx') {
            await new Promise((resolve, reject) => {
                processXLSX(fileBuffer, outputPath, {
                    download: (filePath) => resolve(filePath),
                    status: () => {},
                }, outputFileName, candidateFormat);
            });
            outputFiles.push({ path: outputPath, name: `processed_${originalname.replace(/\s+/g, '_')}` });
            tempFiles.push(outputPath);
        }
        // Ignore unsupported files here
    }

    // Loop through uploaded files
    for (const file of req.files) {
        const ext = path.extname(file.originalname).toLowerCase();
        if (ext === '.zip') {
            // Extract ZIP and process each CSV/XLSX inside
            const zip = new AdmZip(file.buffer);
            const zipEntries = zip.getEntries();
            for (const entry of zipEntries) {
                if (!entry.isDirectory) {
                    const entryExt = path.extname(entry.entryName).toLowerCase();
                    if (entryExt === '.csv' || entryExt === '.xlsx') {
                        await processSingleFile(entry.getData(), entry.entryName);
                    }
                }
            }
        } else if (ext === '.csv' || ext === '.xlsx') {
            await processSingleFile(file.buffer, file.originalname);
        }
    }

    // Send results
    if (outputFiles.length === 0) {
        return res.status(400).send('No valid files to process');
    } else if (outputFiles.length === 1) {
        // Single file: send directly
        const { path: filePath, name } = outputFiles[0];
        res.download(filePath, name, (err) => {
            // Clean up
            try { fs.unlinkSync(filePath); } catch {}
        });
    } else {
        // Multiple files: zip and send
        const zipName = `processed_files_${Date.now()}.zip`;
        const zipPath = path.join('uploads', zipName);
        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip', { zlib: { level: 9 } });
        archive.pipe(output);
        for (const file of outputFiles) {
            archive.file(file.path, { name: file.name });
        }
        await archive.finalize();
        output.on('close', () => {
            res.download(zipPath, zipName, (err) => {
                // Clean up
                try { fs.unlinkSync(zipPath); } catch {}
                for (const file of tempFiles) { try { fs.unlinkSync(file); } catch {} }
            });
        });
    }
});

function processCSV(fileBuffer, outputPath, res, outputFileName, candidateFormat) {
    const fileContent = fileBuffer.toString('utf8');
    const lines = fileContent.split('\n').filter(line => line.trim() !== '');
    
    if (lines.length === 0) {
        return res.status(400).send('Empty CSV file');
    }

    // Get headers from first line
    const headers = lines[0].split(',').map(h => h.trim());
    console.log('Input file headers:', headers);

    // Determine format
    let COLUMN_MAPPING, COLUMN_ORDER, isFresher;
    if (candidateFormat === 'fresher') {
        COLUMN_MAPPING = FRESHER_COLUMN_MAPPING;
        COLUMN_ORDER = FRESHER_COLUMN_ORDER;
        isFresher = true;
    } else {
        COLUMN_MAPPING = EXPERIENCE_COLUMN_MAPPING;
        COLUMN_ORDER = null;
        isFresher = false;
    }

    // Find indices of columns we want to keep
    let columnIndices = Object.keys(COLUMN_MAPPING).map(oldName => {
        const index = headers.findIndex(h => h === oldName);
        if (index === -1) {
            console.warn(`Column not found: "${oldName}"`);
        }
        return { index, oldName, newName: COLUMN_MAPPING[oldName] };
    }).filter(item => item.index !== -1 || item.newName === 'Status');

    // Add Status column if it doesn't exist in the input
    if (!headers.includes('Status')) {
        columnIndices.push({ index: -1, oldName: 'Status', newName: 'Status' });
    }

    // Add Comments column if it doesn't exist in the input
    if (!headers.includes('Comments')) {
        columnIndices.push({ index: -1, oldName: 'Comments', newName: 'Comments' });
    }

    // For fresher, order columns as per FRESHER_COLUMN_ORDER
    if (isFresher) {
        columnIndices = FRESHER_COLUMN_ORDER.map(newName =>
            columnIndices.find(item => item.newName === newName)
        ).filter(Boolean);
    }

    console.log('Column mapping:', columnIndices);

    if (columnIndices.length === 0) {
        return res.status(400).send('No matching columns found in the file');
    }

    // Find the Candidate ID and CREATED_DATE column indices
    const candidateIdIndex = headers.findIndex(h => h === 'Candidate ID');
    const createdDateIndex = headers.findIndex(h => h === 'CREATED_DATE');
    
    if (candidateIdIndex === -1) {
        return res.status(400).send('Candidate ID column not found');
    }
    if (createdDateIndex === -1) {
        return res.status(400).send('CREATED_DATE column not found');
    }

    // Store latest entries for each Candidate ID
    const latestEntries = new Map();

    // Process all lines to find latest entries
    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());
        const candidateId = values[candidateIdIndex];
        const createdDate = values[createdDateIndex];

        if (!candidateId) continue;

        const currentEntry = {
            values: values,
            createdDate: createdDate,
            applicationDate: values[headers.findIndex(h => h === 'Tags')] // Get Application Date
        };

        if (!latestEntries.has(candidateId) || 
            (createdDate && latestEntries.get(candidateId).createdDate < createdDate)) {
            latestEntries.set(candidateId, currentEntry);
        }
    }

    // Convert Map to Array and sort by Application Date
    const sortedEntries = Array.from(latestEntries.values()).sort((a, b) => {
        const dateA = dateToNumber(a.applicationDate);
        const dateB = dateToNumber(b.applicationDate);
        // Sort from newest (largest number) to oldest (smallest number)
        return dateB - dateA;
    });

    // Write headers to output file
    const newHeaders = columnIndices.map(item => item.newName);
    fs.writeFileSync(outputPath, newHeaders.join(',') + '\n');

    // Write sorted entries to output file
    for (const entry of sortedEntries) {
        const outputValues = columnIndices.map(item => {
            if (item.index === -1 && item.newName === 'Status') {
                return 'Active';
            }
            if (item.index === -1 && item.newName === 'Comments') {
                return '';
            }
            let value = entry.values[item.index];
            if (value !== undefined) {
                if (isFresher && item.newName === 'Application Date') {
                    value = formatDate(value);
                }
                if (!isFresher && item.newName === 'Applicaiton Date') {
                    value = formatDate(value);
                }
                if (item.newName === 'Updation Date') {
                    value = formatDate(value);
                }
                return value;
            }
            return '';
        });
        fs.appendFileSync(outputPath, outputValues.join(',') + '\n');
    }

    // Send the processed file
    res.download(outputPath, outputFileName, (err) => {
        if (err) {
            console.error('Error sending file:', err);
        }
        // Clean up file
        try {
            fs.unlinkSync(outputPath);
        } catch (cleanupErr) {
            console.error('Error cleaning up file:', cleanupErr);
        }
    });
}

function processXLSX(fileBuffer, outputPath, res, outputFileName, candidateFormat) {
    try {
        // Read workbook from buffer
        const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        
        // Convert to JSON to make column selection easier
        const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        if (data.length === 0) {
            throw new Error('Empty worksheet');
        }

        // Get headers
        const headers = data[0];
        console.log('Input file headers:', headers);

        // Determine format
        let COLUMN_MAPPING, COLUMN_ORDER, isFresher;
        if (candidateFormat === 'fresher') {
            COLUMN_MAPPING = FRESHER_COLUMN_MAPPING;
            COLUMN_ORDER = FRESHER_COLUMN_ORDER;
            isFresher = true;
        } else {
            COLUMN_MAPPING = EXPERIENCE_COLUMN_MAPPING;
            COLUMN_ORDER = null;
            isFresher = false;
        }

        // Find indices of columns we want to keep
        let columnIndices = Object.keys(COLUMN_MAPPING).map(oldName => {
            const index = headers.findIndex(h => h === oldName);
            if (index === -1) {
                console.warn(`Column not found: "${oldName}"`);
            }
            return { index, oldName, newName: COLUMN_MAPPING[oldName] };
        }).filter(item => item.index !== -1 || item.newName === 'Status');

        // Add Status column if it doesn't exist in the input
        if (!headers.includes('Status')) {
            columnIndices.push({ index: -1, oldName: 'Status', newName: 'Status' });
        }

        // Add Comments column if it doesn't exist in the input
        if (!headers.includes('Comments')) {
            columnIndices.push({ index: -1, oldName: 'Comments', newName: 'Comments' });
        }

        // For fresher, order columns as per FRESHER_COLUMN_ORDER
        if (isFresher) {
            columnIndices = FRESHER_COLUMN_ORDER.map(newName =>
                columnIndices.find(item => item.newName === newName)
            ).filter(Boolean);
        }

        console.log('Column mapping:', columnIndices);

        if (columnIndices.length === 0) {
            throw new Error('No matching columns found in the file');
        }

        // Find the Candidate ID and CREATED_DATE column indices
        const candidateIdIndex = headers.findIndex(h => h === 'Candidate ID');
        const createdDateIndex = headers.findIndex(h => h === 'CREATED_DATE');
        
        if (candidateIdIndex === -1) {
            throw new Error('Candidate ID column not found');
        }
        if (createdDateIndex === -1) {
            throw new Error('CREATED_DATE column not found');
        }

        // Store latest entries for each Candidate ID
        const latestEntries = new Map();

        // Process all rows to find latest entries
        for (let i = 1; i < data.length; i++) {
            const row = data[i];
            const candidateId = row[candidateIdIndex];
            const createdDate = row[createdDateIndex];

            if (!candidateId) continue;

            const currentEntry = {
                row: row,
                createdDate: createdDate,
                applicationDate: row[headers.findIndex(h => h === 'Tags')] // Get Application Date
            };

            if (!latestEntries.has(candidateId) || 
                (createdDate && latestEntries.get(candidateId).createdDate < createdDate)) {
                latestEntries.set(candidateId, currentEntry);
            }
        }

        // Convert Map to Array and sort by Application Date
        const sortedEntries = Array.from(latestEntries.values()).sort((a, b) => {
            const dateA = dateToNumber(a.applicationDate);
            const dateB = dateToNumber(b.applicationDate);
            // Sort from newest (largest number) to oldest (smallest number)
            return dateB - dateA;
        });

        // Create new data with only latest entries
        const newData = [
            columnIndices.map(item => item.newName) // Headers
        ];

        // Add sorted entries
        for (const entry of sortedEntries) {
            const newRow = columnIndices.map(item => {
                if (item.index === -1 && item.newName === 'Status') {
                    return 'Active';
                }
                if (item.index === -1 && item.newName === 'Comments') {
                    return '';
                }
                let value = entry.row[item.index];
                if (value !== undefined) {
                    if (isFresher && item.newName === 'Application Date') {
                        value = formatDate(value);
                    }
                    if (!isFresher && item.newName === 'Applicaiton Date') {
                        value = formatDate(value);
                    }
                    if (item.newName === 'Updation Date') {
                        value = formatDate(value);
                    }
                    return value;
                }
                return '';
            });
            newData.push(newRow);
        }

        // Create new worksheet
        const newWorksheet = XLSX.utils.json_to_sheet(newData);
        
        // Create new workbook
        const newWorkbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(newWorkbook, newWorksheet, 'Sheet1');
        
        // Write to file
        XLSX.writeFile(newWorkbook, outputPath);

        // Send the processed file
        res.download(outputPath, outputFileName, (err) => {
            if (err) {
                console.error('Error sending file:', err);
            }
            // Clean up file
            try {
                fs.unlinkSync(outputPath);
            } catch (cleanupErr) {
                console.error('Error cleaning up file:', cleanupErr);
            }
        });
    } catch (err) {
        console.error('Error processing XLSX file:', err);
        res.status(500).send('Error processing XLSX file: ' + err.message);
    }
}

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
}); 