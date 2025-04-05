/**
 * GLB Extractor Tool - Utility Functions
 * Contains helper functions for the GLB Extractor Tool
 */

// Global log container reference
let logsContainer;

/**
 * Log a message to the console and UI
 * @param {string} message - The message to log
 * @param {string} type - The type of message (info, error, warning)
 */
function log(message, type = 'info') {
    console.log(`[${type.toUpperCase()}] ${message}`);
    
    // If logs container is initialized, add log to UI
    if (logsContainer) {
        const logEntry = document.createElement('div');
        logEntry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        logEntry.className = type;
        logsContainer.appendChild(logEntry);
        logsContainer.scrollTop = logsContainer.scrollHeight;
    }
}

/**
 * Show a status message to the user
 * @param {string} message - The message to display
 * @param {string} type - The type of message (info, error, success)
 */
function showStatus(message, type) {
    const statusMessage = document.getElementById('status-message');
    if (!statusMessage) return;

    statusMessage.textContent = message;
    statusMessage.style.display = 'block';
    statusMessage.className = 'status-message';
    if (type) {
        statusMessage.classList.add(type);
    }
    log(message, type);
}

/**
 * Format a file size in bytes to a human-readable format
 * @param {number} bytes - The file size in bytes
 * @returns {string} - The formatted file size
 */
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Read a file as ArrayBuffer
 * @param {File} file - The file to read
 * @returns {Promise<ArrayBuffer>} - A promise that resolves with the file content
 */
function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => resolve(event.target.result);
        reader.onerror = (error) => reject(error);
        reader.readAsArrayBuffer(file);
    });
}

/**
 * Sanitize a glTF object to ensure it is valid
 * @param {Object} gltf - The glTF object to sanitize
 */
function sanitizeGLTF(gltf) {
    // Clean up nodes - handle empty arrays
    if (gltf.nodes) {
        gltf.nodes.forEach(node => {
            if (node.children && node.children.length === 0) {
                delete node.children;
            }
            
            // Ensure matrix is valid if present
            if (node.matrix && node.matrix.length !== 16) {
                delete node.matrix;
            }
            
            // Clean up empty objects
            for (const key in node) {
                if (node[key] && typeof node[key] === 'object' && 
                    !Array.isArray(node[key]) && Object.keys(node[key]).length === 0) {
                    delete node[key];
                }
            }
        });
    }
    
    // Ensure meshes are properly formatted
    if (gltf.meshes) {
        gltf.meshes.forEach(mesh => {
            if (mesh.primitives) {
                mesh.primitives.forEach(primitive => {
                    // Fix material index if invalid
                    if (primitive.material !== undefined && 
                        (typeof primitive.material !== 'number' || 
                         primitive.material < 0 || 
                         primitive.material >= (gltf.materials ? gltf.materials.length : 0))) {
                        primitive.material = 0;
                    }
                    
                    // Remove any targets (morph targets) which could cause issues
                    if (primitive.targets && primitive.targets.length === 0) {
                        delete primitive.targets;
                    }
                });
            }
        });
    }
    
    // Cleanup empty arrays in scenes
    if (gltf.scenes) {
        gltf.scenes.forEach(scene => {
            if (scene.nodes && scene.nodes.length === 0) {
                delete scene.nodes;
            }
        });
    }
    
    // Validate that there's at least one scene if scenes array exists
    if (gltf.scenes && gltf.scenes.length === 0) {
        delete gltf.scenes;
    }
    
    // Ensure default scene index is valid
    if (gltf.scene !== undefined && 
        (!gltf.scenes || gltf.scene >= gltf.scenes.length || gltf.scene < 0)) {
        gltf.scene = 0;
    }
    
    // Remove possibly problematic extensions
    if (gltf.extensionsUsed) {
        // If we removed texture references, also remove extensions that depend on them
        const textureRelatedExtensions = [
            'KHR_materials_pbrSpecularGlossiness',
            'KHR_materials_clearcoat',
            'KHR_materials_transmission',
            'KHR_materials_sheen',
            'KHR_materials_unlit'
        ];
        
        gltf.extensionsUsed = gltf.extensionsUsed.filter(ext => 
            !textureRelatedExtensions.includes(ext)
        );
        
        if (gltf.extensionsUsed.length === 0) {
            delete gltf.extensionsUsed;
        }
    }
    
    if (gltf.extensionsRequired) {
        // Remove extensions that would require textures
        const textureRelatedExtensions = [
            'KHR_materials_pbrSpecularGlossiness',
            'KHR_materials_clearcoat',
            'KHR_materials_transmission',
            'KHR_materials_sheen',
            'KHR_materials_unlit'
        ];
        
        gltf.extensionsRequired = gltf.extensionsRequired.filter(ext => 
            !textureRelatedExtensions.includes(ext)
        );
        
        if (gltf.extensionsRequired.length === 0) {
            delete gltf.extensionsRequired;
        }
    }
    
    // Clean up material extensions
    if (gltf.materials) {
        gltf.materials.forEach(material => {
            if (material.extensions) {
                // Remove all extensions from materials since we're removing textures
                delete material.extensions;
            }
        });
    }
    
    // Cleanup any undefined or null values that might have crept in
    cleanupObject(gltf);
}

/**
 * Recursively clean up an object by removing undefined/null values and empty objects
 * @param {Object} obj - The object to clean up
 */
function cleanupObject(obj) {
    if (!obj || typeof obj !== 'object') return;
    
    for (const key in obj) {
        if (obj[key] === undefined || obj[key] === null) {
            delete obj[key];
        } else if (typeof obj[key] === 'object') {
            cleanupObject(obj[key]);
            
            // Remove empty objects and arrays
            if (obj[key] && typeof obj[key] === 'object' && 
                Object.keys(obj[key]).length === 0) {
                delete obj[key];
            }
        }
    }
}

/**
 * Pack a glTF structure into a GLB binary file
 * @param {Object} gltf - The glTF object to pack
 * @param {ArrayBuffer} binaryChunk - The binary chunk to include (optional)
 * @returns {ArrayBuffer} - The packed GLB file
 */
function packGLB(gltf, binaryChunk) {
    try {
        log(`Packing GLB - JSON size: ${JSON.stringify(gltf).length} bytes, Binary chunk: ${binaryChunk ? binaryChunk.byteLength : 0} bytes`);
        
        // Sanitize the glTF object to ensure it's properly formatted
        sanitizeGLTF(gltf);
        
        // Make sure we have the required glTF 2.0 fields
        if (!gltf.asset) {
            gltf.asset = { 
                version: "2.0",
                generator: "GLB Extractor Tool v1.5"
            };
        } else {
            gltf.asset.generator = "GLB Extractor Tool v1.5";
            gltf.asset.version = "2.0";  // Ensure version is set correctly
        }
        
        // Convert GLTF JSON to string with careful handling
        const gltfString = JSON.stringify(gltf);
        
        // Use TextEncoder for proper UTF-8 encoding
        const encoder = new TextEncoder();
        const jsonBuffer = encoder.encode(gltfString);
        log(`JSON buffer length: ${jsonBuffer.byteLength} bytes`);
        
        // GLB requires 4-byte alignment
        // Calculate padding needed to align to 4 bytes
        const jsonPadding = (4 - (jsonBuffer.byteLength % 4)) % 4;
        const jsonPaddedLength = jsonBuffer.byteLength + jsonPadding;
        log(`JSON padded length: ${jsonPaddedLength} bytes (padding: ${jsonPadding} bytes)`);
        
        // Calculate binary chunk padding and length
        let binPaddedLength = 0;
        let binPadding = 0;
        if (binaryChunk && binaryChunk.byteLength > 0) {
            binPadding = (4 - (binaryChunk.byteLength % 4)) % 4;
            binPaddedLength = binaryChunk.byteLength + binPadding;
            log(`Binary chunk padded length: ${binPaddedLength} bytes (padding: ${binPadding} bytes)`);
        }
        
        // Calculate headers and total length
        const headerLength = 12; // GLB header: magic(4) + version(4) + length(4)
        const jsonChunkHeaderLength = 8; // Chunk header: length(4) + type(4)
        const binChunkHeaderLength = (binaryChunk && binaryChunk.byteLength > 0) ? 8 : 0;
        
        // Calculate total file length
        const totalLength = headerLength + jsonChunkHeaderLength + jsonPaddedLength + 
                          ((binaryChunk && binaryChunk.byteLength > 0) ? binChunkHeaderLength + binPaddedLength : 0);
        log(`Total GLB file length: ${totalLength} bytes`);
        
        // Create buffer for the GLB file with exact size
        const buffer = new ArrayBuffer(totalLength);
        const dataView = new DataView(buffer);
        const bufferBytes = new Uint8Array(buffer);
        
        // First, clear the entire buffer to ensure no garbage data
        bufferBytes.fill(0);
        
        // Write GLB header
        dataView.setUint32(0, 0x46546C67, true); // 'glTF' magic
        dataView.setUint32(4, 2, true); // Version 2
        dataView.setUint32(8, totalLength, true); // Total length
        
        // Write JSON chunk header
        dataView.setUint32(12, jsonPaddedLength, true); // Chunk length
        dataView.setUint32(16, 0x4E4F534A, true); // 'JSON' chunk type
        
        // Write JSON data with proper encoding
        bufferBytes.set(jsonBuffer, 20);
        
        // Add padding (zeros) after JSON if needed - already filled with zeros
        let offset = 20 + jsonBuffer.byteLength + jsonPadding;
        
        // Write BIN chunk if present
        if (binaryChunk && binaryChunk.byteLength > 0) {
            // Write BIN chunk header
            dataView.setUint32(offset, binPaddedLength, true); // Chunk length
            dataView.setUint32(offset + 4, 0x004E4942, true); // 'BIN\0' chunk type
            offset += 8;
            
            // Copy binary data
            const binData = new Uint8Array(binaryChunk);
            bufferBytes.set(binData, offset);
            
            // Padding bytes after binary are already zeroed
        }
        
        // Verify final buffer
        if (buffer.byteLength !== totalLength) {
            log(`Warning: Buffer length mismatch. Expected ${totalLength}, got ${buffer.byteLength}`, 'warning');
        }
        
        log(`Successfully packed GLB file (${formatFileSize(buffer.byteLength)})`);
        return buffer;
    } catch (error) {
        log(`Error packing GLB: ${error.message}`, 'error');
        console.error(error);
        return null;
    }
}

/**
 * Show auto-download message
 * @param {string} type - The type of files being downloaded
 * @param {string} fileName - The name of the ZIP file
 */
function showAutoDownloadMessage(type, fileName) {
    const autoDownloadInfo = document.getElementById('auto-download-info');
    if (!autoDownloadInfo) return;
    
    autoDownloadInfo.textContent = `${fileName} is being automatically downloaded.`;
    autoDownloadInfo.style.display = 'block';
}

// Export utility functions
window.GlbExtractorUtils = {
    log,
    showStatus,
    formatFileSize,
    readFileAsArrayBuffer,
    sanitizeGLTF,
    cleanupObject,
    packGLB,
    showAutoDownloadMessage
};

// Initialize logs container reference when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    logsContainer = document.getElementById('logs-container');
});
