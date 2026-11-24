export interface NotificationEvent {
  readonly title: string;
  readonly message: string;
  readonly fields?: ReadonlyArray<{ label: string; value: string }>;
  readonly actionUrl?: string;
}

export interface INotificationGateway {
  notifyGroup(event: NotificationEvent): Promise<void>;
}
