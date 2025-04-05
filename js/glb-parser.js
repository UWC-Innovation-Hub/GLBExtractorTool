/**
 * GLB Extractor Tool - GLB Parser
 * Contains functions for parsing GLB/GLTF files
 */

// Use utility functions from the main module
const { log } = window.GlbExtractorUtils;

/**
 * Parse a GLB or GLTF file
 * @param {File} file - The file to parse
 * @param {ArrayBuffer} arrayBuffer - The file content as ArrayBuffer
 * @returns {Promise<Object>} - A promise that resolves with the parsed glTF data
 */
async function parseGLTF(file, arrayBuffer) {
    try {
        // Check if it's a GLB file (binary glTF)
        const isGLB = file.name.toLowerCase().endsWith('.glb');
        
        if (isGLB) {
            return parseGLBBinary(arrayBuffer);
        } else {
            // For GLTF (JSON)
            return parseGLTFJSON(arrayBuffer);
        }
    } catch (error) {
        log(`Error parsing GLTF: ${error.message}`, 'error');
        throw error;
    }
}

/**
 * Parse a GLB binary file
 * @param {ArrayBuffer} arrayBuffer - The file content as ArrayBuffer
 * @returns {Object} - The parsed glTF data
 */
function parseGLBBinary(arrayBuffer) {
    try {
        log('Processing GLB binary format');
        const dataView = new DataView(arrayBuffer);
        
        // Check GLB header
        const magic = dataView.getUint32(0, true);
        if (magic !== 0x46546C67) { // 'glTF' in ASCII
            throw new Error('Invalid GLB file: Incorrect magic number');
        }
        
        const version = dataView.getUint32(4, true);
        log(`GLB version: ${version}`);
        
        if (version !== 2) {
            log(`Warning: Unsupported GLB version ${version}. Trying to process anyway.`, 'warning');
        }
        
        const fileLength = dataView.getUint32(8, true);
        log(`GLB reported length: ${fileLength} bytes`);
        
        // Parse chunks
        let offset = 12; // GLB header size
        let jsonChunk = null;
        let binaryChunk = null;
        
        // First chunk should be JSON
        const jsonChunkLength = dataView.getUint32(offset, true);
        offset += 4;
        const jsonChunkType = dataView.getUint32(offset, true);
        offset += 4;
        
        if (jsonChunkType !== 0x4E4F534A) { // 'JSON' in ASCII
            throw new Error('Invalid GLB file: First chunk is not JSON');
        }
        
        log(`JSON chunk size: ${jsonChunkLength} bytes`);
        const jsonData = arrayBuffer.slice(offset, offset + jsonChunkLength);
        offset += jsonChunkLength;
        
        // Parse JSON data
        const decoder = new TextDecoder('utf-8');
        const jsonText = decoder.decode(jsonData);
        try {
            const gltf = JSON.parse(jsonText);
            log(`GLTF JSON parsed: ${Object.keys(gltf).join(', ')}`);
            
            // Check for binary chunk (BIN)
            if (offset < arrayBuffer.byteLength) {
                const binaryChunkLength = dataView.getUint32(offset, true);
                offset += 4;
                const binaryChunkType = dataView.getUint32(offset, true);
                offset += 4;
                
                if (binaryChunkType === 0x004E4942) { // 'BIN\0' in ASCII
                    log(`BIN chunk size: ${binaryChunkLength} bytes`);
                    binaryChunk = arrayBuffer.slice(offset, offset + binaryChunkLength);
                } else {
                    log(`Warning: Unknown chunk type: 0x${binaryChunkType.toString(16)}`, 'warning');
                }
            }
            
            return {
                json: gltf,
                binaryChunk: binaryChunk,
                originalArrayBuffer: arrayBuffer
            };
        } catch (jsonError) {
            log(`Error parsing JSON: ${jsonError.message}`, 'error');
            throw new Error(`Invalid GLB file: JSON chunk contains invalid JSON. ${jsonError.message}`);
        }
        
    } catch (error) {
        log(`Error parsing GLB binary: ${error.message}`, 'error');
        throw error;
    }
}

/**
 * Parse a GLTF JSON file
 * @param {ArrayBuffer} arrayBuffer - The file content as ArrayBuffer
 * @returns {Object} - The parsed glTF data
 */
function parseGLTFJSON(arrayBuffer) {
    try {
        log('Processing GLTF JSON format');
        
        // Parse JSON data
        const decoder = new TextDecoder('utf-8');
        const jsonText = decoder.decode(arrayBuffer);
        try {
            const gltf = JSON.parse(jsonText);
            log(`GLTF JSON parsed: ${Object.keys(gltf).join(', ')}`);
            
            return {
                json: gltf,
                binaryChunk: null,
                originalArrayBuffer: arrayBuffer
            };
        } catch (jsonError) {
            log(`Error parsing JSON: ${jsonError.message}`, 'error');
            throw new Error(`Invalid GLTF file: Contains invalid JSON. ${jsonError.message}`);
        }
        
    } catch (error) {
        log(`Error parsing GLTF JSON: ${error.message}`, 'error');
        throw error;
    }
}

// Export parser functions
window.GlbParser = {
    parseGLTF,
    parseGLBBinary,
    parseGLTFJSON
};
