export async function promptInput(message: string, defaultValue?: string): Promise<string | null> {
  return window.prompt(message, defaultValue);
}

export async function confirmAction(message: string): Promise<boolean> {
  return window.confirm(message);
}

export function showAlert(message: string): void {
  window.alert(message);
}
