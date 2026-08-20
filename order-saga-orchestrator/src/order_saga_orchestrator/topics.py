from enum import StrEnum


class Topic(StrEnum):
    COMMANDS_INVENTORY = "commands.inventory"
    EVENTS_INVENTORY = "events.inventory"
    COMMANDS_PAYMENT = "commands.payment"
    EVENTS_PAYMENT = "events.payment"
    COMMANDS_NOTIFICATION = "commands.notification"
    EVENTS_NOTIFICATION = "events.notification"
    DLQ_PAYMENT = "dlq.payment"
