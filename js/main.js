/**
 * GLB Extractor Tool - Main Script
 * Initializes the application and connects all modules
 */

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Get DOM elements
    const dropArea = document.getElementById('drop-area');
    const fileInput = document.getElementById('file-input');
    const selectFileBtn = document.getElementById('select-file-btn');
    const fileInfo = document.getElementById('file-info');
    const fileName = document.getElementById('file-name');
    const fileSize = document.getElementById('file-size');
    const downloadTexturesBtn = document.getElementById('download-textures-btn');
    const downloadMaterialsBtn = document.getElementById('download-materials-btn');
    const progressBar = document.getElementById('progress-bar');
    const debugToggle = document.getElementById('debug-toggle');
    const logsContainer = document.getElementById('logs-container');
    const extractTextures = document.getElementById('extract-textures');
    const extractMaterials = document.getElementById('extract-materials');
    const autoDownloadTextures = document.getElementById('auto-download-textures');
    const autoDownloadMaterials = document.getElementById('auto-download-materials');
    const texturesSection = document.getElementById('textures-section');
    const materialsSection = document.getElementById('materials-section');
    
    // Access utility functions
    const { 
        log, showStatus, formatFileSize, readFileAsArrayBuffer, showAutoDownloadMessage 
    } = window.GlbExtractorUtils;
    
    // Access parser functions
    const { parseGLTF } = window.GlbParser;
    
    // Access texture functions
    const { 
        extractTexturesFromGLTF, displayTextures, downloadTexture, downloadAllTextures 
    } = window.TextureExtractor;
    
    // Access material functions
    const {
        extractMaterialsFromGLTF, generateColorFromIndex, createGLBForMaterial, 
        displayMaterials, downloadMaterial, downloadAllMaterials
    } = window.MaterialExtractor;
    
    // Application state
    let extractedTextures = [];
    let extractedMaterials = [];
    let originalFileName = '';
    
    // Debug log toggle
    debugToggle.addEventListener('click', () => {
        const isVisible = logsContainer.style.display === 'block';
        logsContainer.style.display = isVisible ? 'none' : 'block';
        debugToggle.textContent = isVisible ? 'Show Debug Logs' : 'Hide Debug Logs';
    });
    
    // Event listeners for drag and drop
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, preventDefaults, false);
    });
    
    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    ['dragenter', 'dragover'].forEach(eventName => {
        dropArea.addEventListener(eventName, highlight, false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, unhighlight, false);
    });
    
    function highlight() {
        dropArea.classList.add('highlight');
    }
    
    function unhighlight() {
        dropArea.classList.remove('highlight');
    }
    
    // Handle dropped files
    dropArea.addEventListener('drop', handleDrop, false);
    
    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        
        if (files.length > 0 && (files[0].name.toLowerCase().endsWith('.glb') || files[0].name.toLowerCase().endsWith('.gltf'))) {
            handleFiles(files);
        } else {
            showStatus('Please drop a GLB or GLTF file.', 'error');
        }
    }
    
    // Handle file selection
    selectFileBtn.addEventListener('click', () => {
        fileInput.click();
    });
    
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFiles(e.target.files);
        }
    });
    
    // Process selected files
    function handleFiles(files) {
        const file = files[0];
        
        if (!file.name.toLowerCase().endsWith('.glb') && !file.name.toLowerCase().endsWith('.gltf')) {
            showStatus('Please select a GLB or GLTF file.', 'error');
            return;
        }
        
        // Store original file name without extension
        originalFileName = file.name.replace(/\.[^/.]+$/, "");
        
        // Display file info
        fileName.textContent = file.name;
        fileSize.textContent = formatFileSize(file.size);
        fileInfo.style.display = 'block';
        progressBar.style.display = 'block';
        progressBar.value = 5;
        
        // Reset UI
        texturesSection.style.display = 'none';
        materialsSection.style.display = 'none';
        document.getElementById('texture-list').innerHTML = '';
        document.getElementById('material-list').innerHTML = '';
        document.getElementById('auto-download-info').style.display = 'none';
        logsContainer.innerHTML = '';
        
        extractedTextures = [];
        extractedMaterials = [];
        
        // Show status
        showStatus('Processing file...', 'info');
        log(`Processing file: ${file.name} (${formatFileSize(file.size)})`);
        
        // Process the file
        processFile(file);
    }
    
    async function processFile(file) {
        try {
            progressBar.value = 10;
            const arrayBuffer = await readFileAsArrayBuffer(file);
            log(`File loaded into memory: ${formatFileSize(arrayBuffer.byteLength)}`);
            
            // Parse the GLB/GLTF file
            const gltfData = await parseGLTF(file, arrayBuffer);
            
            if (!gltfData) {
                showStatus('Failed to parse the GLB/GLTF file.', 'error');
                progressBar.style.display = 'none';
                return;
            }
            
            // Check if extraction options are enabled
            const doExtractTextures = extractTextures.checked;
            const doExtractMaterials = extractMaterials.checked;
            
            if (!doExtractTextures && !doExtractMaterials) {
                showStatus('Please select at least one extraction option.', 'error');
                progressBar.style.display = 'none';
                return;
            }
            
            // Extract textures if option is enabled
            if (doExtractTextures) {
                log('Starting texture extraction');
                progressBar.value = 20;
                
                const textures = extractTexturesFromGLTF(gltfData.json, gltfData.binaryChunk);
                
                if (textures.length > 0) {
                    log(`Extracted ${textures.length} textures successfully`);
                    extractedTextures = textures;
                    displayTextures(textures);
                    texturesSection.style.display = 'block';
                    
                    // Auto-download textures if option enabled
                    if (autoDownloadTextures.checked) {
                        const zipFileName = `${originalFileName}_textures.zip`;
                        downloadAllTextures(zipFileName, textures);
                        showAutoDownloadMessage('textures', zipFileName);
                    }
                } else {
                    log('No textures found in file');
                }
            }
            
            // Extract materials if option is enabled
            if (doExtractMaterials) {
                log('Starting material extraction');
                progressBar.value = doExtractTextures ? 60 : 20;
                
                const materials = extractMaterialsFromGLTF(gltfData.json);
                
                if (materials.length > 0) {
                    log(`Extracted ${materials.length} materials successfully`);
                    
                    // Generate unique colors for materials
                    materials.forEach((material, index) => {
                        // Generate a deterministic color for preview
                        material.previewColor = generateColorFromIndex(index);
                    });
                    
                    extractedMaterials = materials;
                    displayMaterials(materials);
                    materialsSection.style.display = 'block';
                    
                    // Process GLB structures for each material
                    for (let i = 0; i < materials.length; i++) {
                        log(`Processing GLB for material ${i + 1} of ${materials.length}: ${materials[i].name}`);
                        materials[i].glbData = createGLBForMaterial(gltfData, materials[i].index);
                        log(`Finished GLB for material ${i + 1}: ${materials[i].name}`);
                    }
                    
                    // Auto-download materials if option enabled
                    if (autoDownloadMaterials.checked) {
                        downloadAllMaterials(`${originalFileName}_materials.zip`, materials);
                        showAutoDownloadMessage('materials', `${originalFileName}_materials.zip`);
                    }
                } else {
                    log('No materials found in file');
                }
            }
            
            progressBar.value = 100;
            progressBar.style.display = 'none';
            
            // Show success message
            let message = '';
            if (doExtractTextures) message += `${extractedTextures.length} textures`;
            if (doExtractTextures && doExtractMaterials) message += ' and ';
            if (doExtractMaterials) message += `${extractedMaterials.length} materials`;
            
            if ((doExtractTextures && extractedTextures.length === 0) && 
                (doExtractMaterials && extractedMaterials.length === 0)) {
                showStatus('No textures or materials could be extracted from this file.', 'info');
            } else {
                showStatus(`Successfully extracted ${message} from the file.`, 'success');
            }
            
        } catch (error) {
            console.error('Error processing file:', error);
            log(`Error processing file: ${error.message}`, 'error');
            showStatus(`Error processing file: ${error.message}`, 'error');
            progressBar.style.display = 'none';
        }
    }
    
    // Download buttons events
    downloadTexturesBtn.addEventListener('click', () => {
        if (extractedTextures.length === 0) return;
        const zipFileName = `${originalFileName}_textures.zip`;
        downloadAllTextures(zipFileName, extractedTextures);
    });
    
    downloadMaterialsBtn.addEventListener('click', () => {
        if (extractedMaterials.length === 0) return;
        downloadAllMaterials(`${originalFileName}_materials.zip`, extractedMaterials);
    });

    // Log initialization complete
    log('GLB Extractor Tool initialized');
});
