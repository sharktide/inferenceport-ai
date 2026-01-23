interface NotificationAction {
    label: string;
    onClick?: () => void;
}
interface NotificationOptions {
    message: string;
    type?: "info" | "success" | "error" | "warning";
    actions?: NotificationAction[];
}
declare function showNotification({ message, type, actions, }: NotificationOptions): void;
export { showNotification };
//# sourceMappingURL=notification.d.ts.map