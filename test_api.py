from pybit.unified_trading import HTTP

API_KEY = "pTRtHhIA6TD0eqyeB3"
API_SECRET = "MDncLofTbAsBhk2EWhTagfLj4y6BHdGj4k44"

session = HTTP(
    testnet=False,
    api_key=API_KEY,
    api_secret=API_SECRET,
)

try:
    response = session.get_wallet_balance(accountType="UNIFIED")
    
    if response["retCode"] == 0:
        print("З'єднання успішне! Доступ отримано.")
        total_equity = response["result"]["list"][0]["totalEquity"]
        print(f"Загальний баланс акаунта (USD): {total_equity}")
    else:
        print(f"Помилка біржі: {response['retMsg']}")

except Exception as e:
    print(f"Помилка запиту: {e}")
