import random
from abc import ABC, abstractmethod


class PaymentProvider(ABC):
    @abstractmethod
    def charge(self, card_number: str) -> bool:
        """카드로 결제를 시도하고 성공 여부를 반환한다."""
        pass


class MockPaymentProvider(PaymentProvider):
    FAILING_CARD_NUMBER = "4000000000000002"
    RANDOM_FAILURE_RATE = 0.1

    def charge(self, card_number: str) -> bool:
        if card_number == self.FAILING_CARD_NUMBER:
            return False

        return random.random() >= self.RANDOM_FAILURE_RATE
 