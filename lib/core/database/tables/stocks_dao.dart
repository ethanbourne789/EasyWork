import 'package:drift/drift.dart';
import '../app_database.dart';
import 'stocks_table.dart';

part 'stocks_dao.g.dart';

@DriftAccessor(tables: [Stocks])
class StocksDao extends DatabaseAccessor<AppDatabase>
    with _$StocksDaoMixin {
  StocksDao(AppDatabase db) : super(db);

  Future<List<Stock>> getAllStocks() => select(stocks).get();
  Future<Stock?> getStockById(int id) =>
      (select(stocks)..where((t) => t.id.equals(id))).getSingleOrNull();
  Future<Stock?> getStockByCode(String code) =>
      (select(stocks)..where((t) => t.code.equals(code)))
          .getSingleOrNull();
  Future<int> insertStock(StocksCompanion stock) =>
      into(stocks).insert(stock);
  Future<bool> updateStock(StocksCompanion stock) =>
      update(stocks).replace(stock);
  Future<int> deleteStock(int id) =>
      (delete(stocks)..where((t) => t.id.equals(id))).go();
}
