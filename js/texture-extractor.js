/**
 * GLB Extractor Tool - Texture Extractor
 * Contains functions for extracting textures from GLB/GLTF files
 */

// Use utility functions from the main modules
const { log, formatFileSize } = window.GlbExtractorUtils;

/**
 * Extract textures from a GLTF structure
 * @param {Object} gltf - The GLTF JSON structure
 * @param {ArrayBuffer} binaryChunk - The binary chunk from the GLB file
 * @returns {Array} - An array of extracted textures
 */
function extractTexturesFromGLTF(gltf, binaryChunk) {
    const images = [];
    
    if (!gltf.images || gltf.images.length === 0) {
        log('No images defined in GLTF structure');
        return images;
    }
    
    log(`Found ${gltf.images.length} images in GLTF structure`);
    
    // Process each image
    gltf.images.forEach((image, imageIndex) => {
        try {
            let imageData = null;
            let imageName = image.name || `image_${imageIndex}`;
            let mimeType = image.mimeType || 'image/png';
            
            log(`Processing image: ${imageName} (${mimeType})`);
            
            if (image.uri) {
                // Image is embedded as data URI
                if (image.uri.startsWith('data:')) {
                    log('Image is embedded as data URI');
                    const dataUriRegex = /^data:([^;]+);base64,(.+)$/;
                    const matches = image.uri.match(dataUriRegex);
                    
                    if (matches && matches.length === 3) {
                        mimeType = matches[1];
                        const base64Data = matches[2];
                        
                        // Convert base64 to binary
                        const binaryString = atob(base64Data);
                        const bytes = new Uint8Array(binaryString.length);
                        for (let i = 0; i < binaryString.length; i++) {
                            bytes[i] = binaryString.charCodeAt(i);
                        }
                        
                        imageData = bytes.buffer;
                        log(`Decoded data URI image: ${formatFileSize(imageData.byteLength)}`);
                    }
                } else {
                    // External URI - not supported in this extractor
                    log(`Image references external URI: ${image.uri} (not supported)`, 'warning');
                }
            } else if (image.bufferView !== undefined && binaryChunk) {
                // Image is stored in the binary chunk via bufferView
                const bufferView = gltf.bufferViews[image.bufferView];
                
                if (bufferView) {
                    const start = bufferView.byteOffset || 0;
                    const length = bufferView.byteLength;
                    
                    log(`Image stored in bufferView ${image.bufferView}: offset=${start}, length=${length}`);
                    
                    // Extract image data from binary chunk
                    imageData = binaryChunk.slice(start, start + length);
                    log(`Extracted image from binary chunk: ${formatFileSize(imageData.byteLength)}`);
                } else {
                    log(`Missing bufferView ${image.bufferView}`, 'error');
                }
            }
            
            if (imageData) {
                // Find more meaningful name using textures and materials
                let betterName = findMeaningfulTextureName(gltf, imageIndex, imageName);
                
                images.push({
                    name: betterName,
                    data: imageData,
                    mimeType: mimeType
                });
                
                log(`Successfully processed image: ${betterName}`);
            }
        } catch (error) {
            console.error(`Error processing image ${imageIndex}:`, error);
            log(`Error processing image ${imageIndex}: ${error.message}`, 'error');
        }
    });
    
    return images;
}

/**
 * Find a meaningful name for a texture based on its usage in materials
 * @param {Object} gltf - The GLTF JSON structure
 * @param {number} imageIndex - The index of the image
 * @param {string} fallbackName - A fallback name to use if no meaningful name can be found
 * @returns {string} - A meaningful name for the texture
 */
function findMeaningfulTextureName(gltf, imageIndex, fallbackName) {
    // Try to find meaningful texture name by checking materials and textures
    if (!gltf.textures || !gltf.materials) {
        return fallbackName;
    }
    
    // First find which textures use this image
    const texturesUsingThisImage = [];
    gltf.textures.forEach((texture, textureIndex) => {
        if (texture.source === imageIndex) {
            texturesUsingThisImage.push(textureIndex);
        }
    });
    
    if (texturesUsingThisImage.length === 0) {
        return fallbackName;
    }
    
    // Now find materials that use these textures and their role
    const textureRoles = [];
    
    gltf.materials.forEach((material, materialIndex) => {
        const materialName = material.name || `material_${materialIndex}`;
        
        // Check PBR materials
        if (material.pbrMetallicRoughness) {
            checkTextureRef(material.pbrMetallicRoughness.baseColorTexture, 'baseColor', materialName);
            checkTextureRef(material.pbrMetallicRoughness.metallicRoughnessTexture, 'metallicRoughness', materialName);
        }
        
        // Check other common texture types
        checkTextureRef(material.normalTexture, 'normal', materialName);
        checkTextureRef(material.occlusionTexture, 'occlusion', materialName);
        checkTextureRef(material.emissiveTexture, 'emissive', materialName);
    });
    
    function checkTextureRef(textureInfo, typeName, materialName) {
        if (textureInfo && textureInfo.index !== undefined && 
            texturesUsingThisImage.includes(textureInfo.index)) {
            textureRoles.push(`${materialName}_${typeName}`);
        }
    }
    
    // Use the first role found, or fallback name
    return textureRoles.length > 0 ? textureRoles[0] : fallbackName;
}

/**
 * Display extracted textures in the UI
 * @param {Array} textures - The extracted textures
 */
function displayTextures(textures) {
    const textureList = document.getElementById('texture-list');
    const downloadTexturesBtn = document.getElementById('download-textures-btn');
    
    if (!textureList || !downloadTexturesBtn) return;
    
    textureList.innerHTML = '';
    
    textures.forEach((texture, index) => {
        const textureItem = document.createElement('div');
        textureItem.className = 'item-card';
        
        // Create a blob URL from the texture data
        const blob = new Blob([texture.data], { type: texture.mimeType });
        const blobUrl = URL.createObjectURL(blob);
        
        // Create an image element
        const img = document.createElement('img');
        img.className = 'texture-img';
        img.src = blobUrl;
        img.alt = texture.name;
        
        // Create a label for the texture name
        const nameDiv = document.createElement('div');
        nameDiv.className = 'item-name';
        nameDiv.textContent = texture.name;
        
        // Create a download button
        const downloadBtn = document.createElement('button');
        downloadBtn.className = 'item-download';
        downloadBtn.textContent = 'Download';
        downloadBtn.addEventListener('click', () => {
            downloadTexture(texture, index);
        });
        
        // Append elements to the texture item
        textureItem.appendChild(img);
        textureItem.appendChild(nameDiv);
        textureItem.appendChild(downloadBtn);
        
        // Add the texture item to the list
        textureList.appendChild(textureItem);
    });
    
    // Enable download all button
    downloadTexturesBtn.disabled = textures.length === 0;
}

/**
 * Download a single texture
 * @param {Object} texture - The texture to download
 * @param {number} index - The index of the texture
 */
function downloadTexture(texture, index) {
    // Get the file extension from the MIME type
    let extension = 'bin';  // Default extension if we can't determine it
    if (texture.mimeType) {
        const mimeTypeParts = texture.mimeType.split('/');
        if (mimeTypeParts.length > 1) {
            extension = mimeTypeParts[1].replace('jpeg', 'jpg');
        }
    }
    
    // Create a filename with the correct extension based on the MIME type
    const filename = `${texture.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.${extension}`;
    
    // Create a blob with the original MIME type
    const blob = new Blob([texture.data], { 
        type: texture.mimeType,
        lastModified: new Date().getTime()
    });
    
    saveAs(blob, filename);
}

/**
 * Download all textures as a ZIP file
 * @param {string} zipFileName - The name of the ZIP file
 * @param {Array} textures - The textures to download
 */
function downloadAllTextures(zipFileName, textures) {
    if (textures.length === 0) return;
    
    const zip = new JSZip();
    
    // Add each texture to the ZIP file with proper extension
    textures.forEach((texture, index) => {
        // Get the file extension from the MIME type
        let extension = 'bin';  // Default extension
        if (texture.mimeType) {
            const mimeTypeParts = texture.mimeType.split('/');
            if (mimeTypeParts.length > 1) {
                extension = mimeTypeParts[1].replace('jpeg', 'jpg');
            }
        }
        
        const filename = `${texture.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.${extension}`;
        zip.file(filename, texture.data);
    });
    
    // Generate and download the ZIP file with current timestamp metadata
    zip.generateAsync({
        type: 'blob',
        mimeType: 'application/zip',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
        // Set the date to current time for all files
        date: new Date()
    }).then((blob) => {
        saveAs(blob, zipFileName);
    });
}

// Export texture functions
window.TextureExtractor = {
    extractTexturesFromGLTF,
    findMeaningfulTextureName,
    displayTextures,
    downloadTexture,
    downloadAllTextures
};
