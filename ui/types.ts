export interface NibDocumentContent {
  content: string;
  contentType: string;
}

export type NibDocumentState = "loading" | "error" | "loaded";

export interface NibDocument {
  state: NibDocumentState;
  content: NibDocumentContent;
}

export type CloseCallback = () => void;

export type NavigatePosition = "above" | "below" | "left" | "right";

export type NavigateCallback = (
  target: string,
  action: string,
  position: NavigatePosition
) => void;

export type SaveCallback = (newContent: NibDocumentContent) => void;

export interface HandlerProps {
  slug: string;
  document: NibDocument;
  onNavigate: NavigateCallback;
  onSave: SaveCallback;
}
