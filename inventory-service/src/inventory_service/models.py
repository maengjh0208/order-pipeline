from sqlalchemy import Uuid
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class ProductModel(Base):
    __tablename__ = "products"

    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True)
    product_name: Mapped[str]
    stock: Mapped[int]