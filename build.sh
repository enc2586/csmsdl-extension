#!/bin/bash

# CSMSDL Extension Build Script
# Creates a distributable ZIP package for Chrome/Edge extension

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get version from manifest.json
VERSION=$(grep -o '"version": "[^"]*"' manifest.json | cut -d'"' -f4)

# Create dist directory if it doesn't exist
mkdir -p dist

# Define output filename
OUTPUT_FILE="dist/csmsdl-extension-v${VERSION}.zip"

echo -e "${BLUE}Building CSMSDL Extension v${VERSION}...${NC}"

# Remove old zip file if exists
if [ -f "$OUTPUT_FILE" ]; then
    echo "Removing old package..."
    rm "$OUTPUT_FILE"
fi

echo "Creating package..."
zip -r "$OUTPUT_FILE" . \
    -x "*.git*" \
    -x "*.DS_Store" \
    -x "README.md" \
    -x "RELEASE_NOTES.md" \
    -x "SCREENSHOT_GUIDE.md" \
    -x "SUBMISSION_GUIDE.md" \
    -x "store_description.md" \
    -x "build.sh" \
    -x "dist/*" \
    -x "screenshots/*" \
    -x "promotional_images/*" \
    -x "icons/icon.png" \
    -x "*.zip"

echo -e "${GREEN}✓ Package created: $OUTPUT_FILE${NC}"

# Show file size
FILE_SIZE=$(ls -lh "$OUTPUT_FILE" | awk '{print $5}')
echo -e "${GREEN}✓ File size: $FILE_SIZE${NC}"

# Show contents
echo -e "\n${BLUE}Package contents:${NC}"
unzip -l "$OUTPUT_FILE"

echo -e "\n${GREEN}Build complete!${NC}"
