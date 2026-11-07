import os
import time
from typing import Optional, List, Dict, Any
from sqlalchemy import (
    create_engine, Column, Integer, String, Float, Boolean, ForeignKey, Text, select, update, delete
)
from sqlalchemy.orm import declarative_base, sessionmaker, relationship, Session

raw_db_url = os.getenv("DATABASE_URL", "sqlite:///./bygigabit.db")

# Render видає postgres:// або postgresql://
# Вказуємо postgresql+psycopg2:// для надійного драйвера psycopg2-binary
if raw_db_url.startswith("postgres://"):
    raw_db_url = raw_db_url.replace("postgres://", "postgresql+psycopg2://", 1)
elif raw_db_url.startswith("postgresql://") and not raw_db_url.startswith("postgresql+"):
    raw_db_url = raw_db_url.replace("postgresql://", "postgresql+psycopg2://", 1)

connect_args = {"check_same_thread": False} if raw_db_url.startswith("sqlite") else {}

engine = create_engine(
    raw_db_url,
    connect_args=connect_args,
    pool_pre_ping=True
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class UserModel(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    password = Column(String(255), nullable=False)
    role = Column(String(50), default="Trader", nullable=False)
    twoFactor = Column(Boolean, default=True, nullable=False)
    balance = Column(Float, default=10000.0, nullable=False)
    tradesCount = Column(Integer, default=0, nullable=False)
    isBlocked = Column(Boolean, default=False, nullable=False)
    registeredAt = Column(String(50), nullable=False)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "email": self.email,
            "password": self.password,
            "role": self.role,
            "twoFactor": self.twoFactor,
            "balance": round(self.balance, 2),
            "tradesCount": self.tradesCount,
            "isBlocked": self.isBlocked,
            "registeredAt": self.registeredAt,
        }


class SessionModel(Base):
    __tablename__ = "sessions"

    token = Column(String(255), primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    createdAt = Column(String(50), nullable=False)


class PositionModel(Base):
    __tablename__ = "positions"

    id = Column(String(100), primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    symbol = Column(String(50), default="BTCUSDT", nullable=False)
    side = Column(String(20), nullable=False)
    entryPrice = Column(Float, nullable=False)
    markPrice = Column(Float, nullable=False)
    margin = Column(Float, nullable=False)
    leverage = Column(Integer, nullable=False)
    size = Column(Float, nullable=False)
    liqPrice = Column(Float, nullable=False)
    unrealizedPnL = Column(Float, default=0.0, nullable=False)
    roi = Column(Float, default=0.0, nullable=False)
    openedAt = Column(String(50), nullable=False)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "symbol": self.symbol,
            "side": self.side,
            "entryPrice": self.entryPrice,
            "markPrice": self.markPrice,
            "margin": self.margin,
            "leverage": self.leverage,
            "size": self.size,
            "liqPrice": self.liqPrice,
            "unrealizedPnL": self.unrealizedPnL,
            "roi": self.roi,
            "openedAt": self.openedAt,
        }


class LimitOrderModel(Base):
    __tablename__ = "limit_orders"

    id = Column(String(100), primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    symbol = Column(String(50), default="BTCUSDT", nullable=False)
    side = Column(String(20), nullable=False)
    orderType = Column(String(50), default="limit", nullable=False)
    orderPrice = Column(Float, nullable=False)
    margin = Column(Float, nullable=False)
    leverage = Column(Integer, nullable=False)
    size = Column(Float, nullable=False)
    status = Column(String(50), default="active", nullable=False)
    createdAt = Column(String(50), nullable=False)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "symbol": self.symbol,
            "side": self.side,
            "orderType": self.orderType,
            "orderPrice": self.orderPrice,
            "margin": self.margin,
            "leverage": self.leverage,
            "size": self.size,
            "status": self.status,
            "createdAt": self.createdAt,
        }


class OrderHistoryModel(Base):
    __tablename__ = "order_history"

    id = Column(String(100), primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    symbol = Column(String(50), default="BTCUSDT", nullable=False)
    side = Column(String(20), nullable=False)
    orderType = Column(String(50), default="market", nullable=False)
    price = Column(Float, nullable=False)
    closePrice = Column(Float, nullable=False)
    margin = Column(Float, nullable=False)
    leverage = Column(Integer, nullable=False)
    pnl = Column(Float, nullable=False)
    roi = Column(Float, nullable=False)
    status = Column(String(50), default="closed", nullable=False)
    time = Column(String(50), nullable=False)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "symbol": self.symbol,
            "side": self.side,
            "orderType": self.orderType,
            "price": self.price,
            "closePrice": self.closePrice,
            "margin": self.margin,
            "leverage": self.leverage,
            "pnl": self.pnl,
            "roi": self.roi,
            "status": self.status,
            "time": self.time,
        }


def init_db():
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        admin = db.query(UserModel).filter(UserModel.email == "admin@bygigabit.com").first()
        if not admin:
            admin = UserModel(
                email="admin@bygigabit.com",
                password="SecurePass123!",
                role="Admin",
                twoFactor=True,
                balance=25000.0,
                tradesCount=115,
                isBlocked=False,
                registeredAt="2026-10-10 09:00"
            )
            db.add(admin)

        trader = db.query(UserModel).filter(UserModel.email == "trader@bygigabit.com").first()
        if not trader:
            trader = UserModel(
                email="trader@bygigabit.com",
                password="SecurePass123!",
                role="Trader",
                twoFactor=True,
                balance=10000.0,
                tradesCount=4,
                isBlocked=False,
                registeredAt="2026-10-15 14:22"
            )
            db.add(trader)
        db.commit()


# --- Хелпери для взаємодії з БД ---

def db_get_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    with SessionLocal() as db:
        user = db.query(UserModel).filter(UserModel.email == email.lower().strip()).first()
        return user.to_dict() if user else None


def db_get_user_by_id(user_id: int) -> Optional[Dict[str, Any]]:
    with SessionLocal() as db:
        user = db.query(UserModel).filter(UserModel.id == user_id).first()
        return user.to_dict() if user else None


def db_create_user(email: str, password: str, role: str = "Trader", balance: float = 10000.0) -> Dict[str, Any]:
    with SessionLocal() as db:
        now_str = time.strftime("%Y-%m-%d %H:%M")
        user = UserModel(
            email=email.lower().strip(),
            password=password,
            role=role,
            twoFactor=True,
            balance=balance,
            tradesCount=0,
            isBlocked=False,
            registeredAt=now_str
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return user.to_dict()


def db_update_user_balance(user_id: int, delta_balance: float = 0.0, increment_trades: bool = False, reset_to: Optional[float] = None) -> Optional[Dict[str, Any]]:
    with SessionLocal() as db:
        user = db.query(UserModel).filter(UserModel.id == user_id).first()
        if not user:
            return None
        if reset_to is not None:
            user.balance = reset_to
        else:
            user.balance += delta_balance
        if increment_trades:
            user.tradesCount += 1
        db.commit()
        db.refresh(user)
        return user.to_dict()


def db_toggle_user_block(user_id: int) -> Optional[Dict[str, Any]]:
    with SessionLocal() as db:
        user = db.query(UserModel).filter(UserModel.id == user_id).first()
        if not user:
            return None
        user.isBlocked = not user.isBlocked
        db.commit()
        db.refresh(user)
        return user.to_dict()


def db_get_all_users() -> List[Dict[str, Any]]:
    with SessionLocal() as db:
        users = db.query(UserModel).order_by(UserModel.id.asc()).all()
        return [u.to_dict() for u in users]


# --- Сесії ---

def db_save_session(token: str, user_id: int):
    with SessionLocal() as db:
        sess = SessionModel(token=token, user_id=user_id, createdAt=time.strftime("%Y-%m-%d %H:%M:%S"))
        db.merge(sess)
        db.commit()


def db_get_user_by_session(token: str) -> Optional[Dict[str, Any]]:
    with SessionLocal() as db:
        sess = db.query(SessionModel).filter(SessionModel.token == token).first()
        if not sess:
            return None
        user = db.query(UserModel).filter(UserModel.id == sess.user_id).first()
        if not user or user.isBlocked:
            return None
        return user.to_dict()


def db_delete_session(token: str):
    with SessionLocal() as db:
        sess = db.query(SessionModel).filter(SessionModel.token == token).first()
        if sess:
            db.delete(sess)
            db.commit()


# --- Позиції та ордери користувача ---

def db_get_positions(user_id: int) -> List[Dict[str, Any]]:
    with SessionLocal() as db:
        positions = db.query(PositionModel).filter(PositionModel.user_id == user_id).all()
        return [p.to_dict() for p in positions]


def db_save_position(user_id: int, pos_data: Dict[str, Any]):
    with SessionLocal() as db:
        pos = PositionModel(
            id=pos_data["id"],
            user_id=user_id,
            symbol=pos_data.get("symbol", "BTCUSDT"),
            side=pos_data["side"],
            entryPrice=pos_data["entryPrice"],
            markPrice=pos_data.get("markPrice", pos_data["entryPrice"]),
            margin=pos_data["margin"],
            leverage=pos_data["leverage"],
            size=pos_data["size"],
            liqPrice=pos_data["liqPrice"],
            unrealizedPnL=pos_data.get("unrealizedPnL", 0.0),
            roi=pos_data.get("roi", 0.0),
            openedAt=pos_data.get("openedAt", time.strftime("%Y-%m-%d %H:%M:%S"))
        )
        db.merge(pos)
        db.commit()


def db_delete_position(user_id: int, pos_id: str) -> Optional[Dict[str, Any]]:
    with SessionLocal() as db:
        pos = db.query(PositionModel).filter(PositionModel.user_id == user_id, PositionModel.id == pos_id).first()
        if pos:
            data = pos.to_dict()
            db.delete(pos)
            db.commit()
            return data
        return None


def db_clear_positions(user_id: int):
    with SessionLocal() as db:
        db.query(PositionModel).filter(PositionModel.user_id == user_id).delete()
        db.commit()


def db_get_limit_orders(user_id: int) -> List[Dict[str, Any]]:
    with SessionLocal() as db:
        orders = db.query(LimitOrderModel).filter(LimitOrderModel.user_id == user_id).all()
        return [o.to_dict() for o in orders]


def db_save_limit_order(user_id: int, order_data: Dict[str, Any]):
    with SessionLocal() as db:
        ord_obj = LimitOrderModel(
            id=order_data["id"],
            user_id=user_id,
            symbol=order_data.get("symbol", "BTCUSDT"),
            side=order_data["side"],
            orderType=order_data.get("orderType", "limit"),
            orderPrice=order_data["orderPrice"],
            margin=order_data["margin"],
            leverage=order_data["leverage"],
            size=order_data["size"],
            status=order_data.get("status", "active"),
            createdAt=order_data.get("createdAt", time.strftime("%Y-%m-%d %H:%M:%S"))
        )
        db.merge(ord_obj)
        db.commit()


def db_delete_limit_order(user_id: int, order_id: str) -> Optional[Dict[str, Any]]:
    with SessionLocal() as db:
        ord_obj = db.query(LimitOrderModel).filter(LimitOrderModel.user_id == user_id, LimitOrderModel.id == order_id).first()
        if ord_obj:
            data = ord_obj.to_dict()
            db.delete(ord_obj)
            db.commit()
            return data
        return None


def db_clear_limit_orders(user_id: int):
    with SessionLocal() as db:
        db.query(LimitOrderModel).filter(LimitOrderModel.user_id == user_id).delete()
        db.commit()


def db_get_order_history(user_id: int, limit: int = 20) -> List[Dict[str, Any]]:
    with SessionLocal() as db:
        history = db.query(OrderHistoryModel).filter(OrderHistoryModel.user_id == user_id).order_by(OrderHistoryModel.time.desc()).limit(limit).all()
        return [h.to_dict() for h in history]


def db_save_order_history(user_id: int, history_data: Dict[str, Any]):
    with SessionLocal() as db:
        h = OrderHistoryModel(
            id=history_data["id"],
            user_id=user_id,
            symbol=history_data.get("symbol", "BTCUSDT"),
            side=history_data["side"],
            orderType=history_data.get("orderType", "market"),
            price=history_data["price"],
            closePrice=history_data["closePrice"],
            margin=history_data["margin"],
            leverage=history_data["leverage"],
            pnl=history_data["pnl"],
            roi=history_data["roi"],
            status=history_data.get("status", "closed"),
            time=history_data.get("time", time.strftime("%Y-%m-%d %H:%M:%S"))
        )
        db.merge(h)
        db.commit()


def db_get_all_positions() -> List[Dict[str, Any]]:
    """Отримати всі активні позиції всіх користувачів для фонової перевірки ліквідацій."""
    with SessionLocal() as db:
        positions = db.query(PositionModel).all()
        res = []
        for p in positions:
            d = p.to_dict()
            d["user_id"] = p.user_id
            res.append(d)
        return res


def db_get_all_limit_orders() -> List[Dict[str, Any]]:
    """Отримати всі активні лімітні ордери всіх користувачів."""
    with SessionLocal() as db:
        orders = db.query(LimitOrderModel).all()
        res = []
        for o in orders:
            d = o.to_dict()
            d["user_id"] = o.user_id
            res.append(d)
        return res


def db_liquidate_position(user_id: int, pos_id: str, mark_price: float) -> Optional[Dict[str, Any]]:
    """Примусова серверна ліквідація позиції при досягненні liqPrice."""
    with SessionLocal() as db:
        pos = db.query(PositionModel).filter(PositionModel.user_id == user_id, PositionModel.id == pos_id).first()
        if not pos:
            return None

        pos_data = pos.to_dict()
        margin = pos_data["margin"]
        liq_price = pos_data["liqPrice"]
        exit_price = round(mark_price, 2) if mark_price > 0 else liq_price

        # Видалення ліквідованої позиції
        db.delete(pos)

        # Фіксація ліквідації в історії
        liq_record = OrderHistoryModel(
            id=f"LIQ-{int(time.time() * 1000) % 100000}",
            user_id=user_id,
            symbol=pos_data["symbol"],
            side=pos_data["side"],
            orderType="liquidation",
            price=pos_data["entryPrice"],
            closePrice=exit_price,
            margin=margin,
            leverage=pos_data["leverage"],
            pnl=-margin,
            roi=-100.0,
            status="liquidated",
            time=time.strftime("%Y-%m-%d %H:%M:%S")
        )
        db.add(liq_record)

        # Списання маржі з балансу користувача
        user = db.query(UserModel).filter(UserModel.id == user_id).first()
        if user:
            user.balance = round(max(0.0, user.balance - margin), 2)
            user.tradesCount = (user.tradesCount or 0) + 1

        db.commit()

        result = liq_record.to_dict()
        result["user_id"] = user_id
        return result

