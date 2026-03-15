import * as cornerstone from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import cornerstoneDICOMImageLoader from '@cornerstonejs/dicom-image-loader';
import dicomParser from 'dicom-parser';

const {
  PanTool,
  WindowLevelTool,
  StackScrollTool,
  ZoomTool,
  LengthTool,
  AngleTool,
  RectangleROITool,
  EllipticalROITool,
  CrosshairsTool,
  ToolGroupManager,
  Enums: csToolsEnums,
} = cornerstoneTools;

const { MouseBindings } = csToolsEnums;

let initialized = false;

export const TOOL_GROUP_ID = 'radassistToolGroup';
export const RENDERING_ENGINE_ID = 'radassistRenderingEngine';

export async function initCornerstone(): Promise<void> {
  if (initialized) return;

  // Init DICOM image loader
  cornerstoneDICOMImageLoader.init({
    maxWebWorkers: navigator.hardwareConcurrency || 4,
  });
  cornerstoneDICOMImageLoader.wadouri.register(cornerstone);

  // Configure metadata provider
  const { calibratedPixelSpacingMetadataProvider } = cornerstone.utilities;
  cornerstone.metaData.addProvider(
    cornerstoneDICOMImageLoader.wadouri.metaData.getNumberValue.bind(
      cornerstoneDICOMImageLoader.wadouri.metaData
    ),
    1
  );

  // Init cornerstone core
  await cornerstone.init();

  // Init cornerstone tools
  cornerstoneTools.init();

  // Add tools
  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(WindowLevelTool);
  cornerstoneTools.addTool(StackScrollTool);
  cornerstoneTools.addTool(ZoomTool);
  cornerstoneTools.addTool(LengthTool);
  cornerstoneTools.addTool(AngleTool);
  cornerstoneTools.addTool(RectangleROITool);
  cornerstoneTools.addTool(EllipticalROITool);

  initialized = true;
}

export function createToolGroup(): typeof cornerstoneTools.Types.IToolGroup | null {
  const existing = ToolGroupManager.getToolGroup(TOOL_GROUP_ID);
  if (existing) {
    ToolGroupManager.destroyToolGroup(TOOL_GROUP_ID);
  }

  const toolGroup = ToolGroupManager.createToolGroup(TOOL_GROUP_ID);
  if (!toolGroup) return null;

  // Add tools to group
  toolGroup.addTool(WindowLevelTool.toolName);
  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);
  toolGroup.addTool(StackScrollTool.toolName);
  toolGroup.addTool(LengthTool.toolName);
  toolGroup.addTool(AngleTool.toolName);
  toolGroup.addTool(RectangleROITool.toolName);
  toolGroup.addTool(EllipticalROITool.toolName);

  // Set default bindings
  toolGroup.setToolActive(WindowLevelTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Primary }],
  });
  toolGroup.setToolActive(PanTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Auxiliary }],
  });
  toolGroup.setToolActive(ZoomTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Secondary }],
  });
  toolGroup.setToolActive(StackScrollTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Wheel }],
  });

  return toolGroup;
}

export function setActiveTool(toolName: string): void {
  const toolGroup = ToolGroupManager.getToolGroup(TOOL_GROUP_ID);
  if (!toolGroup) return;

  // Deactivate all annotation tools first
  const annotationTools = [
    LengthTool.toolName,
    AngleTool.toolName,
    RectangleROITool.toolName,
    EllipticalROITool.toolName,
  ];

  annotationTools.forEach((name) => {
    try {
      toolGroup.setToolPassive(name);
    } catch {
      // Tool may not be active
    }
  });

  // Set the primary mouse button tool
  if (toolName === 'WindowLevel') {
    toolGroup.setToolActive(WindowLevelTool.toolName, {
      bindings: [{ mouseButton: MouseBindings.Primary }],
    });
  } else if (toolName === 'Pan') {
    toolGroup.setToolActive(PanTool.toolName, {
      bindings: [{ mouseButton: MouseBindings.Primary }],
    });
  } else if (toolName === 'Zoom') {
    toolGroup.setToolActive(ZoomTool.toolName, {
      bindings: [{ mouseButton: MouseBindings.Primary }],
    });
  } else if (toolName === 'Length') {
    toolGroup.setToolActive(LengthTool.toolName, {
      bindings: [{ mouseButton: MouseBindings.Primary }],
    });
  } else if (toolName === 'Angle') {
    toolGroup.setToolActive(AngleTool.toolName, {
      bindings: [{ mouseButton: MouseBindings.Primary }],
    });
  } else if (toolName === 'RectangleROI') {
    toolGroup.setToolActive(RectangleROITool.toolName, {
      bindings: [{ mouseButton: MouseBindings.Primary }],
    });
  } else if (toolName === 'EllipticalROI') {
    toolGroup.setToolActive(EllipticalROITool.toolName, {
      bindings: [{ mouseButton: MouseBindings.Primary }],
    });
  }
}

export async function loadDicomFiles(
  files: File[]
): Promise<string[]> {
  const imageIds: string[] = [];

  for (const file of files) {
    const imageId = cornerstoneDICOMImageLoader.wadouri.fileManager.add(file);
    imageIds.push(imageId);
  }

  return imageIds;
}

export function parseDicomMetadata(imageId: string): Record<string, any> {
  try {
    const generalSeriesModule = cornerstone.metaData.get(
      'generalSeriesModule',
      imageId
    );
    const patientModule = cornerstone.metaData.get('patientModule', imageId);
    const generalStudyModule = cornerstone.metaData.get(
      'generalStudyModule',
      imageId
    );
    const imagePlaneModule = cornerstone.metaData.get(
      'imagePlaneModule',
      imageId
    );

    return {
      patientName: patientModule?.patientName || 'Unknown',
      patientId: patientModule?.patientId || '',
      studyDate: generalStudyModule?.studyDate || '',
      studyDescription: generalStudyModule?.studyDescription || '',
      seriesDescription: generalSeriesModule?.seriesDescription || '',
      seriesNumber: generalSeriesModule?.seriesNumber || '',
      modality: generalSeriesModule?.modality || '',
      sliceThickness: imagePlaneModule?.sliceThickness || '',
      sliceLocation: imagePlaneModule?.sliceLocation || '',
    };
  } catch {
    return {};
  }
}

export { cornerstone, cornerstoneTools, cornerstoneDICOMImageLoader };
